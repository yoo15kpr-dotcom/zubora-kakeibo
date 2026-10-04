// レシート画像 → {store, total, date, category}
// Anthropic API の画像入力 + 構造化出力で読む。APIキーはサーバー側の環境変数だけに置く。
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";

export const CATEGORIES = ["食費", "交通", "日用品", "趣味", "固定費", "その他"];
export const MEDIA_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // API の画像1枚あたり上限（base64デコード後）
export const MODEL = process.env.RECEIPT_MODEL || "claude-sonnet-5-5";

// 型だけ緩く縛り、値の範囲（整数・日付形式・カテゴリ）は normalizeReceipt で整える。
// ここで厳しくすると、少し外れた返答でも全体が失敗扱いになるため。
const Receipt = z.object({
  store: z.string(),
  total: z.number(),
  date: z.string().nullable(),
  category: z.string(),
});

const PROMPT = `これはレシートの写真です。読み取って次の項目を返してください。
- store: 店名（読めなければ空文字）
- total: 税込合計の整数（円）。合計が読めなければ 0
- date: 日付 "YYYY-MM-DD"。不明なら null
- category: ${CATEGORIES.join(" | ")} のどれか`;

export class ReceiptError extends Error {
  constructor(code, status, message) { super(message || code); this.code = code; this.status = status; }
}

// 入力チェック（API を呼ぶ前に弾けるものはここで弾く）
export function validateInput(body) {
  const { image, mediaType } = body || {};
  if (typeof image !== "string" || !image) throw new ReceiptError("bad_request", 400, "image がありません");
  if (!MEDIA_TYPES.includes(mediaType)) throw new ReceiptError("unsupported_type", 415, "対応していない画像形式です");
  if (!/^[A-Za-z0-9+/]+=*$/.test(image)) throw new ReceiptError("bad_request", 400, "image は base64 文字列にしてください");
  if (Math.floor(image.length * 3 / 4) > MAX_IMAGE_BYTES) throw new ReceiptError("too_large", 413, "画像が大きすぎます");
  return { image, mediaType };
}

// モデルの返答を、ブラウザ側が期待する形に整える
export function normalizeReceipt(r) {
  const total = Math.max(0, Math.round(Number(r?.total) || 0));
  const date = typeof r?.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.date) && !isNaN(Date.parse(r.date)) ? r.date : null;
  const category = CATEGORIES.includes(r?.category) ? r.category : "その他";
  const store = typeof r?.store === "string" ? r.store.trim().slice(0, 60) : "";
  return { store, total, date, category };
}

export async function readReceipt(body, { client = new Anthropic() } = {}) {
  const { image, mediaType } = validateInput(body);
  const res = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    output_config: { effort: "low", format: betaZodOutputFormat(Receipt) },
    // 安全分類で断られた場合はサーバー側で既定のモデルに切り替えて再実行
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    messages: [{
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: mediaType, data: image } },
        { type: "text", text: PROMPT },
      ],
    }],
  });
  if (res.stop_reason === "refusal") throw new ReceiptError("refused", 422, "読み取りを断られました");
  if (!res.parsed_output) throw new ReceiptError("unreadable", 502, "読み取り結果を解釈できませんでした");
  return normalizeReceipt(res.parsed_output);
}
