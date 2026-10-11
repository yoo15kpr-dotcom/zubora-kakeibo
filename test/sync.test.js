import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeState, canon, delKey, newSecret, secretFromText, keysFrom, seal, unseal } from "../public/sync.js";

const ts = d => new Date(2026, 9, d, 12).getTime();
const item = (id, d, text = "ランチ 800円", amount = 800) => ({ id, ts: ts(d), text, amount, cat: "食費" });
const rec = id => ({ id, label: "家賃", amount: 80000, cat: "固定費", start: 2026 * 12 + 9, day: 25 });
const A = () => ({ goal: 50000, items: [item(1, 1), item(2, 2)], recur: [rec(9)], favs: [{ l: "コンビニ", a: 500 }], del: {} });
const B = () => ({ goal: 50000, items: [item(3, 3, "本 1,200円", 1200)], recur: [], favs: [{ l: "コーヒー", a: 300, t: 5 }], del: {} });

test("2人の記録を足し合わせる（どちらの順番でも同じ結果）", () => {
  const ab = mergeState(A(), B()), ba = mergeState(B(), A());
  assert.equal(canon(ab), canon(ba));
  assert.deepEqual(ab.items.map(i => i.id).sort(), [1, 2, 3]);
  assert.equal(ab.recur.length, 1);
  assert.deepEqual(ab.favs.map(f => f.l).sort(), ["コンビニ", "コーヒー"]);
});

test("何回まとめても増えない・まとめた結果とまたまとめても同じ", () => {
  const m = mergeState(A(), B());
  assert.equal(canon(mergeState(m, m)), canon(m));
  assert.equal(canon(mergeState(m, A())), canon(m));
  assert.equal(canon(mergeState(mergeState(m, B()), A())), canon(m));
});

test("消した記録は、相手の家計簿からも消える（相手が古いままでも戻ってこない）", () => {
  const a = A(); a.items = a.items.filter(i => i.id !== 2); a.del[delKey.item(2)] = ts(5);
  const b = mergeState(A(), B()); // 相手はまだ 2 を持っている
  const m = mergeState(b, a);
  assert.ok(!m.items.some(i => i.id === 2));
  assert.ok(m.del[delKey.item(2)]);
  assert.ok(!mergeState(m, A()).items.some(i => i.id === 2), "古いデータとまとめても戻らない");
});

test("毎月の登録をやめると、相手からも消える", () => {
  const a = A(); a.recur = []; a.del[delKey.recur(9)] = ts(6);
  assert.equal(mergeState(a, A()).recur.length, 0);
});

test("よく使う: 消したら相手からも消え、あとで入れ直せば戻る", () => {
  const a = A(); a.favs = []; a.del[delKey.fav("コンビニ", 500)] = 1000;
  const m = mergeState(a, A());
  assert.ok(!m.favs.some(f => f.l === "コンビニ"));
  const again = { ...m, favs: [{ l: "コンビニ", a: 500, t: 2000 }] };
  assert.ok(mergeState(again, m).favs.some(f => f.l === "コンビニ"));
});

test("目標金額は、あとで変えたほうになる", () => {
  const a = { ...A(), goal: 60000, goalTs: 100 }, b = { ...B(), goal: 70000, goalTs: 200 };
  assert.equal(mergeState(a, b).goal, 70000);
  assert.equal(mergeState(b, a).goal, 70000);
  assert.equal(mergeState({ ...A(), goal: 0 }, null).goal, 50000, "おかしな値なら初期値");
});

test("形のおかしい記録（相手のデータが壊れていても）は入れない", () => {
  const bad = { items: [{ id: 5, ts: "きのう", amount: 1, text: "x", cat: "食費" }, null, { id: 6, ts: ts(1), amount: -5, text: "x", cat: "食費" }], recur: [{ id: 7 }], favs: [{ l: 1, a: 1 }], del: { "i:1": "x" } };
  const m = mergeState(A(), bad);
  assert.equal(canon(m), canon(A()));
});

test("暗号化して戻せる。鍵がちがうと読めない", async () => {
  const s1 = newSecret(), s2 = newSecret();
  assert.match(s1, /^[A-Za-z0-9_-]{22}$/);
  const k1 = await keysFrom(s1), k2 = await keysFrom(s2);
  assert.match(k1.token, /^[0-9a-f]{64}$/);
  assert.equal((await keysFrom(s1)).token, k1.token, "同じ鍵なら同じ合図");
  assert.notEqual(k1.token, k2.token);
  const env = await seal(A(), k1.key);
  assert.ok(!JSON.stringify(env).includes("ランチ"), "送る中身に記録の文字は出ない");
  assert.deepEqual(await unseal(env, k1.key), A());
  await assert.rejects(unseal(env, k2.key));
  await assert.rejects(keysFrom("short"), /bad_secret/);
});

test("招待リンクから鍵を取り出す（リンクを貼った文章からでも）", () => {
  const s = newSecret();
  assert.equal(secretFromText("https://zuborakakeibo.vercel.app/#join=" + s), s);
  assert.equal(secretFromText("一緒に使おう https://zuborakakeibo.vercel.app/#join=" + s + " よろしく"), s);
  assert.equal(secretFromText("ランチ850円"), null);
  assert.equal(secretFromText("#join=abc"), null);
});
