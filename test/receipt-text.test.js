import { test } from "node:test";
import assert from "node:assert/strict";
import { receiptFromText } from "../public/parse.js";

// 下の3つは、合成したレシート画像を Tesseract.js（jpn 軽量版）で読んだ実際の出力
const OCR_CONVENI = `の みみ 旨 リー マー ドド
渋谷 駅 前 店
電話 :03-1234-5678
2026 年 10 月 2 日 ( 金 ) 12:34
レジ #2 責 No.123
お に ぎり 鮭 \\160
緑茶 500ml \\140
か ら あ げ ク ン \\238
小計 \\538
(8% 対 象 \\538)
(内 消費 税 等 \\39)
合計 \\538
お 預り \\1.000
お 釣り \\462`;
const OCR_DRUG = `マツ モト キヨ シ

新宿 東口 店

2026/09/28 18:05

シャ ンプ ブー 詰 替 698
ティ ッシュ 5 箱 328
歯みがき 粉 248

小 計 1.274
消費 税 (10%) 127

合 計 \\1,401
クレ ジッ ト \\1,401`;
const OCR_RAMEN = `ラー メン 一 番
26.10.01 20:11

半 油 ラー メン 1 900
餃子 1 350
生ビール 1 550
お 会 計 1800 円
現金 2.000 円
お つり 200 円`;

test("合計: 小計・預り・釣りではなく合計を採る", () => {
  assert.equal(receiptFromText(OCR_CONVENI).total, 538);
  assert.equal(receiptFromText(OCR_DRUG).total, 1401);
  assert.equal(receiptFromText(OCR_RAMEN).total, 1800);
});

test("合計: 1行に貼り付けた場合も読む／合計点数は使わない", () => {
  assert.equal(receiptFromText(OCR_CONVENI.replace(/\n/g, " ")).total, 538);
  assert.equal(receiptFromText("ローソン 2026/10/3 小計 ¥980 合計点数 3点 合計 ¥1,058 お預り ¥2,000").total, 1058);
  assert.equal(receiptFromText("ローソン\n合計点数 3点\n合計 ¥1,058").total, 1058);
});

test("合計が見つからなければ 0", () => {
  assert.equal(receiptFromText("ありがとうございました").total, 0);
  assert.equal(receiptFromText("").total, 0);
});

test("日付: 年月日・スラッシュ・2桁年・令和", () => {
  assert.equal(receiptFromText(OCR_CONVENI).date, "2026-10-02");
  assert.equal(receiptFromText(OCR_DRUG).date, "2026-09-28");
  assert.equal(receiptFromText(OCR_RAMEN).date, "2026-10-01");
  assert.equal(receiptFromText("令和8年10月3日 合計 500").date, "2026-10-03");
  assert.equal(receiptFromText("2026/13/40 合計 500").date, null); // ありえない日付は捨てる
});

test("店名とカテゴリ", () => {
  assert.deepEqual([receiptFromText(OCR_DRUG).store, receiptFromText(OCR_DRUG).category], ["マツモトキヨシ", "日用品"]);
  assert.deepEqual([receiptFromText(OCR_RAMEN).store, receiptFromText(OCR_RAMEN).category], ["ラーメン一番", "食費"]);
  assert.equal(receiptFromText(OCR_CONVENI).category, "食費"); // 店名は誤読でも、品名（おにぎり）から判定
});
