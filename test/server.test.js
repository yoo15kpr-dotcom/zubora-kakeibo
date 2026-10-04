import { test } from "node:test";
import assert from "node:assert/strict";
import { clientIp, keyOk, decodeKey } from "../server.js";

const req = (headers = {}, addr = "10.0.0.5") => ({ headers, socket: { remoteAddress: addr } });

test("clientIp: ヘッダー未指定なら接続元アドレス", () => {
  assert.equal(clientIp(req({ "x-forwarded-for": "1.2.3.4" }), ""), "10.0.0.5");
});

test("clientIp: 指定ヘッダーの先頭の値を使う", () => {
  assert.equal(clientIp(req({ "true-client-ip": "203.0.113.7" }), "true-client-ip"), "203.0.113.7");
  assert.equal(clientIp(req({ "x-forwarded-for": "203.0.113.7, 104.16.0.1" }), "x-forwarded-for"), "203.0.113.7");
  assert.equal(clientIp(req({}), "true-client-ip"), "10.0.0.5"); // ヘッダーがなければ接続元
});

test("keyOk: 合言葉なしなら常に通す、ありなら一致のみ", () => {
  assert.equal(keyOk(undefined, ""), true);
  assert.equal(keyOk("ひみつ", "ひみつ"), true);
  assert.equal(keyOk("ひみ", "ひみつ"), false);
  assert.equal(keyOk(undefined, "ひみつ"), false);
  assert.equal(keyOk("", "ひみつ"), false);
});

test("decodeKey: 日本語の合言葉を復元、壊れた値は undefined", () => {
  assert.equal(decodeKey(encodeURIComponent("お茶の時間")), "お茶の時間");
  assert.equal(decodeKey("%E3%81"), undefined);
  assert.equal(decodeKey(undefined), undefined);
});
