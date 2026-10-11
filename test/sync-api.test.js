import { test } from "node:test";
import assert from "node:assert/strict";
import { createHandler, pathOf, MAX_BODY } from "../api/sync.js";

// Vercel Blob の代わりのメモリ（ETag つき）
function memStore(configured = true) {
  const m = new Map(); let rev = 0;
  return {
    m,
    configured: () => configured,
    async get(p) { return m.get(p) || null; },
    async put(p, text, ifMatch) {
      const o = m.get(p);
      if (ifMatch && (!o || o.etag !== ifMatch)) throw Object.assign(new Error("conflict"), { precondition: true });
      const r = { body: text, etag: '"' + (++rev) + '"' }; m.set(p, r); return { etag: r.etag };
    },
    async del(p) { m.delete(p); },
  };
}
const T1 = "a".repeat(64), T2 = "b".repeat(64);
const env = JSON.stringify({ v: 1, iv: "aaaa", ct: "bbbb" });
const req = (method, token, body, headers = {}) => new Request("http://x/api/sync", { method, headers: { ...(token ? { "x-sync-token": token } : {}), ...headers }, body });

test("保存場所がまだないときは 503", async () => {
  const h = createHandler(memStore(false));
  assert.equal((await h(req("GET", T1))).status, 503);
});

test("合図（token）がおかしいと断る", async () => {
  const h = createHandler(memStore());
  assert.equal((await h(req("GET", ""))).status, 400);
  assert.equal((await h(req("GET", "xyz"))).status, 400);
});

test("最初は 404、置いたら読める。合図ごとに別の場所", async () => {
  const st = memStore(), h = createHandler(st);
  assert.equal((await h(req("GET", T1))).status, 404);
  const w = await h(req("PUT", T1, env));
  assert.equal(w.status, 200);
  const r = await h(req("GET", T1));
  assert.equal(r.status, 200);
  assert.equal(await r.text(), env);
  assert.ok(r.headers.get("etag"));
  assert.equal((await h(req("GET", T2))).status, 404, "別の合図では読めない");
  assert.ok([...st.m.keys()][0] === pathOf(T1) && !pathOf(T1).includes(T1), "置き場所は合図そのものではなくハッシュ");
});

test("読んだあとに相手が書いていたら 412（上書きしない）", async () => {
  const h = createHandler(memStore());
  await h(req("PUT", T1, env));
  const etag = (await h(req("GET", T1))).headers.get("etag");
  assert.equal((await h(req("PUT", T1, env, { "if-match": etag }))).status, 200);
  assert.equal((await h(req("PUT", T1, env, { "if-match": etag }))).status, 412, "古い ETag では書けない");
});

test("圧縮で弱い形（W/）になった ETag でも、読んだ版の上に書ける", async () => {
  const h = createHandler(memStore());
  await h(req("PUT", T1, env));
  const etag = (await h(req("GET", T1))).headers.get("etag");
  assert.equal((await h(req("PUT", T1, env, { "if-match": "W/" + etag }))).status, 200);
  assert.equal((await h(req("PUT", T1, env, { "if-match": "W/" + etag }))).status, 412, "古い版はやはり書けない");
});

test("暗号文の形でないもの・大きすぎるものは置かない", async () => {
  const h = createHandler(memStore());
  assert.equal((await h(req("PUT", T1, "{oops"))).status, 400);
  assert.equal((await h(req("PUT", T1, JSON.stringify({ items: [] })))).status, 400, "平文の家計簿は受け付けない");
  assert.equal((await h(req("PUT", T1, "x".repeat(MAX_BODY + 1)))).status, 413);
});

test("消せる。ほかの方法は 405", async () => {
  const h = createHandler(memStore());
  await h(req("PUT", T1, env));
  assert.equal((await h(req("DELETE", T1))).status, 200);
  assert.equal((await h(req("GET", T1))).status, 404);
  assert.equal((await h(req("POST", T1, env))).status, 405);
});

test("保存場所のエラーは 502 で返す（中身は出さない）", async () => {
  const st = memStore(); st.get = async () => { throw new Error("Vercel Blob: store suspended"); };
  const r = await createHandler(st)(req("GET", T1));
  assert.equal(r.status, 502);
  assert.equal((await r.json()).error, "storage");
});
