import { test } from "node:test";
import assert from "node:assert/strict";
import { amount, dateOf, split, normalize, cat } from "../public/parse.js";

// テストの「今日」は 2026-10-04（日曜）に固定
const NOW = new Date(2026, 9, 4, 9);
const day = (y, m, d) => new Date(y, m - 1, d, 12).getTime();
// submit と同じ流れ（正規化 → 分割）
const parse = t => split(normalize(t), NOW).map(({ a, label, ts, rec }) => ({ a, label, ts, rec }));

test("amount: 数字・区切り・千・万", () => {
  assert.equal(amount("850"), 850);
  assert.equal(amount("1,200"), 1200);
  assert.equal(amount("１，２００"), 1200);
  assert.equal(amount("3千"), 3000);
  assert.equal(amount("1万2千"), 12000);
  assert.equal(amount("15万"), 150000);
  assert.equal(amount("1万2千300"), 12300);
  assert.equal(amount("万"), 10000);
  assert.equal(amount("ランチ"), 0);
});

test("全角数字は半角化される", () => {
  assert.deepEqual(parse("ランチ８５０円"), [{ a: 850, label: "ランチ", ts: null, rec: null }]);
});

test("円で区切って1件ずつ記録", () => {
  assert.deepEqual(parse("コンビニ500円 コンビニ1000円"), [
    { a: 500, label: "コンビニ", ts: null, rec: null },
    { a: 1000, label: "コンビニ", ts: null, rec: null },
  ]);
});

test("円なしの数字にも円を補い、名前を引き継ぐ", () => {
  assert.equal(normalize("コンビニ500 1000"), "コンビニ500円 1000円");
  assert.deepEqual(parse("コンビニ500 1000"), [
    { a: 500, label: "コンビニ", ts: null, rec: null },
    { a: 1000, label: "コンビニ", ts: null, rec: null },
  ]);
});

test("金額表記: 1,200 / 3千 / 1万2千 / 15万", () => {
  assert.deepEqual(parse("ランチ1,200円").map(z => z.a), [1200]);
  assert.deepEqual(parse("本3千円").map(z => z.a), [3000]);
  assert.deepEqual(parse("家賃1万2千円").map(z => z.a), [12000]);
  assert.deepEqual(parse("15万").map(z => z.a), [150000]);
});

test("名前の整理: と・や・で・、を除去、名前なしは「支出」", () => {
  assert.deepEqual(parse("ランチ800円と夕飯1200円").map(z => z.label), ["ランチ", "夕飯"]);
  assert.deepEqual(parse("本500円や雑誌700円").map(z => z.label), ["本", "雑誌"]);
  assert.deepEqual(parse("カフェで600円").map(z => z.label), ["カフェ"]);
  assert.deepEqual(parse("、パン300円、").map(z => z.label), ["パン"]);
  assert.deepEqual(parse("500円").map(z => z.label), ["支出"]);
});

test("日付語: 明日 / あさって / N日 / 来月N日 / 来月 / 今日", () => {
  assert.equal(parse("明日ランチ800円")[0].ts, day(2026, 10, 5));
  assert.equal(parse("あさって映画1800円")[0].ts, day(2026, 10, 6));
  assert.equal(parse("15日 美容院5000円")[0].ts, day(2026, 10, 15));
  assert.equal(parse("来月3日 歯医者3000円")[0].ts, day(2026, 11, 3));
  assert.equal(parse("来月 旅行3万")[0].ts, day(2026, 11, 1));
  assert.deepEqual(parse("今日 コーヒー400円"), [{ a: 400, label: "コーヒー", ts: null, rec: null }]);
});

test("日付は後続の項目にも引き継ぐ", () => {
  assert.deepEqual(parse("来月3日 歯医者3000円 薬1000円").map(z => z.ts), [day(2026, 11, 3), day(2026, 11, 3)]);
});

test("dateOf: 単体", () => {
  assert.deepEqual(dateOf("明日 ランチ", NOW).ts, day(2026, 10, 5));
  assert.equal(dateOf("ランチ", NOW).ts, null);
  assert.deepEqual(dateOf("毎月 家賃", NOW).rec, { day: 4 }); // 日の指定なしは今日の日付
});

test("繰り返し: 毎月N日（前置き・後置き）", () => {
  assert.deepEqual(parse("毎月25日 家賃8万円"), [{ a: 80000, label: "家賃", ts: null, rec: { day: 25 } }]);
  assert.deepEqual(parse("家賃8万円 毎月25日"), [{ a: 80000, label: "家賃", ts: null, rec: { day: 25 } }]);
});

test("繰り返し: 隔週・毎週（曜日指定あり/なし）", () => {
  assert.deepEqual(parse("隔週月曜 ジム2000円")[0].rec, { step: 14, wd: 1 });
  assert.deepEqual(parse("毎週 花500円")[0].rec, { step: 7, wd: null });
  assert.deepEqual(parse("ジム2000円 隔週土曜日")[0].rec, { step: 14, wd: 6 });
});

test("金額がなければ空", () => {
  assert.deepEqual(parse("ランチ"), []);
  assert.deepEqual(parse(""), []);
});

test("カテゴリ判定", () => {
  assert.equal(cat("ランチ"), "食費");
  assert.equal(cat("Suica"), "交通");
  assert.equal(cat("シャンプー"), "日用品");
  assert.equal(cat("映画"), "趣味");
  assert.equal(cat("家賃"), "固定費");
  assert.equal(cat("美容院"), "その他");
});
