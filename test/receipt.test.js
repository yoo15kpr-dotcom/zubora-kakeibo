import { test } from "node:test";
import assert from "node:assert/strict";
import { readReceipt, normalizeReceipt, validateInput, ReceiptError, MODEL } from "../lib/receipt.js";

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64").toString("base64");
const fake = (out, extra = {}) => {
  const calls = [];
  return { calls, beta: { messages: { parse: async p => { calls.push(p); return { stop_reason: "end_turn", parsed_output: out, ...extra }; } } } };
};

test("APIに画像と構造化出力の指定を渡し、結果を整えて返す", async () => {
  const client = fake({ store: " ローソン ", total: 1280, date: "2026-10-03", category: "食費" });
  const r = await readReceipt({ image: PNG, mediaType: "image/png" }, { client });
  assert.deepEqual(r, { store: "ローソン", total: 1280, date: "2026-10-03", category: "食費" });
  const p = client.calls[0];
  assert.equal(p.model, MODEL);
  assert.equal(p.messages[0].content[0].type, "image");
  assert.equal(p.messages[0].content[0].source.media_type, "image/png");
  assert.equal(p.messages[0].content[0].source.data, PNG);
  assert.equal(p.output_config.format.type, "json_schema");
});

test("断られたら refused", async () => {
  const client = fake(null, { stop_reason: "refusal" });
  await assert.rejects(readReceipt({ image: PNG, mediaType: "image/png" }, { client }), e => e instanceof ReceiptError && e.code === "refused");
});

test("入力チェック", () => {
  assert.throws(() => validateInput({}), { code: "bad_request" });
  assert.throws(() => validateInput({ image: PNG, mediaType: "image/heic" }), { code: "unsupported_type" });
  assert.throws(() => validateInput({ image: "data:image/png;base64," + PNG, mediaType: "image/png" }), { code: "bad_request" });
  assert.throws(() => validateInput({ image: "A".repeat(7_000_000), mediaType: "image/png" }), { code: "too_large" });
});

test("返却JSONの正規化: total整数・dateの形式・category", () => {
  assert.deepEqual(normalizeReceipt({ store: "x", total: 980.6, date: "2026/10/03", category: "外食" }),
    { store: "x", total: 981, date: null, category: "その他" });
  assert.deepEqual(normalizeReceipt({ total: -5, date: null }), { store: "", total: 0, date: null, category: "その他" });
});
