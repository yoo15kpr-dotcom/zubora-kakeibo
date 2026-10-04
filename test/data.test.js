import { test } from "node:test";
import assert from "node:assert/strict";
import { exportData, importData, earliestOffset } from "../public/data.js";

const NOW = new Date(2026, 9, 4, 9);
const item = (id, ts, amount = 500) => ({ id, ts, text: "コンビニ " + amount + "円", amount, cat: "食費" });
const base = () => ({
  goal: 50000,
  items: [item(1, new Date(2026, 9, 3, 12).getTime())],
  recur: [{ id: 9, label: "家賃", amount: 80000, cat: "固定費", start: 2026 * 12 + 9, day: 25 }],
  favs: [{ l: "コンビニ", a: 500 }],
});

test("書き出したものを空の端末に読み込むと、目標金額も含めてそのまま移る", () => {
  const S = base();
  const r = importData({ goal: 50000, items: [], recur: [], favs: [] }, exportData({ ...S, goal: 70000 }, NOW));
  assert.equal(r.data.goal, 70000);
  assert.deepEqual(r.data.items, S.items);
  assert.deepEqual(r.data.recur, S.recur);
  assert.deepEqual(r.added, { items: 1, recur: 1, favs: 1 });
});

test("同じバックアップを2回読み込んでも記録は増えない。今の目標金額は変えない", () => {
  const S = base();
  const text = exportData({ ...S, goal: 90000 }, NOW);
  const r = importData(S, text);
  assert.equal(r.data.items.length, 1);
  assert.equal(r.data.recur.length, 1);
  assert.equal(r.data.goal, 50000);
  assert.deepEqual(r.added, { items: 0, recur: 0, favs: 0 });
});

test("新しい記録だけ足す", () => {
  const S = base();
  const other = { ...base(), items: [...base().items, item(2, new Date(2026, 8, 30, 12).getTime(), 1200)] };
  const r = importData(S, exportData(other, NOW));
  assert.equal(r.data.items.length, 2);
  assert.equal(r.added.items, 1);
});

test("壊れたファイル・別のJSON・形の崩れた記録は読み込まない", () => {
  const S = base();
  assert.throws(() => importData(S, "これはJSONではない"), /not_json/);
  assert.throws(() => importData(S, JSON.stringify({ foo: 1 })), /not_backup/);
  const bad = { items: [{ id: 5, ts: "きのう", amount: 100, text: "x", cat: "食費" }, { id: 6, ts: 1, amount: -1, text: "x", cat: "食費" }, null], recur: [{ id: 7 }], favs: [{ l: "", a: "x" }] };
  const r = importData(S, JSON.stringify(bad));
  assert.deepEqual(r.added, { items: 0, recur: 0, favs: 0 });
  assert.deepEqual(r.data.items, S.items);
});

test("一番古い記録の月まで戻れる", () => {
  assert.equal(earliestOffset({ items: [], recur: [] }, NOW), 0);
  assert.equal(earliestOffset({ items: [item(1, new Date(2026, 6, 15).getTime())], recur: [] }, NOW), -3);
  assert.equal(earliestOffset({ items: [], recur: [{ start: 2025 * 12 + 9 }] }, NOW), -12);
});

test("ありえない日時・日付の記録は読み込まない（月の切り替えが壊れないように）", () => {
  const S = base();
  const bad = { items: [{ id: 5, ts: 1e300, amount: 100, text: "x", cat: "食費" }],
    recur: [{ id: 7, label: "x", amount: 1, cat: "固定費", start: 2026 * 12, day: 0 },
            { id: 8, label: "x", amount: 1, cat: "固定費", start: 2026 * 12, step: 3, anchor: Date.UTC(2026, 0, 1) },
            { id: 10, label: "x", amount: 1, cat: "固定費", start: 1e9, day: 5 }] };
  const r = importData(S, JSON.stringify(bad));
  assert.deepEqual(r.added, { items: 0, recur: 0, favs: 0 });
  assert.equal(earliestOffset(r.data, NOW), 0);
});
