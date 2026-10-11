// 2人で同じ家計簿を使うための保存場所（Vercel Blob の非公開ストア）。
// 中身はブラウザで暗号化済み。ここに届くのは暗号文と「合図（token）」だけで、家計簿の中身は読めない。
// 置き場所は token のハッシュで決まるので、token を知らない人は読むことも上書きすることもできない。
import { createHash } from "node:crypto";
import { get, put, del, BlobPreconditionFailedError } from "@vercel/blob";

export const MAX_BODY = 3_000_000; // 暗号文の上限（記録なら1万件以上入る大きさ）
const TOKEN_RE = /^[0-9a-f]{64}$/;
export const pathOf = token => "zubora-sync/" + createHash("sha256").update(token).digest("hex") + ".json";

const reply = (status, body, headers = {}) => new Response(body == null ? null : JSON.stringify(body), {
  status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers },
});

// store: { configured(), get(path) -> {body, etag} | null, put(path, text, ifMatch) -> {etag}, del(path) }
export function createHandler(store) {
  return async function handle(request) {
    if (!store.configured()) return reply(503, { error: "not_configured" });
    const token = request.headers.get("x-sync-token") || "";
    if (!TOKEN_RE.test(token)) return reply(400, { error: "bad_token" });
    const path = pathOf(token);
    try {
      if (request.method == "GET") {
        const r = await store.get(path);
        if (!r) return reply(404, { error: "not_found" });
        return new Response(r.body, { status: 200, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ETag: r.etag } });
      }
      if (request.method == "PUT") {
        if (Number(request.headers.get("content-length")) > MAX_BODY) return reply(413, { error: "too_large" });
        const text = await request.text();
        if (text.length > MAX_BODY) return reply(413, { error: "too_large" });
        let j; try { j = JSON.parse(text); } catch { return reply(400, { error: "bad_body" }); }
        if (!j || j.v !== 1 || typeof j.iv != "string" || typeof j.ct != "string") return reply(400, { error: "bad_body" });
        const r = await store.put(path, text, request.headers.get("if-match") || undefined);
        return reply(200, { ok: true }, { ETag: r.etag });
      }
      if (request.method == "DELETE") { await store.del(path); return reply(200, { ok: true }); }
      return reply(405, { error: "method_not_allowed" }, { Allow: "GET, PUT, DELETE" });
    } catch (e) {
      if (e && e.precondition) return reply(412, { error: "conflict" });
      console.error(e);
      return reply(502, { error: "storage", detail: String((e && e.message) || e).slice(0, 200) });
    }
  };
}

export const blobStore = {
  configured: () => Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID),
  async get(path) {
    const r = await get(path, { access: "private", useCache: false });
    if (!r || !r.stream) return null;
    return { body: await new Response(r.stream).text(), etag: r.blob.etag };
  },
  async put(path, text, ifMatch) {
    try {
      const r = await put(path, text, { access: "private", addRandomSuffix: false, allowOverwrite: true, contentType: "application/json", ...(ifMatch ? { ifMatch } : {}) });
      return { etag: r.etag };
    } catch (e) {
      if (e instanceof BlobPreconditionFailedError) e.precondition = true;
      throw e;
    }
  },
  async del(path) { await del(path); },
};

export default { fetch: createHandler(blobStore) };
