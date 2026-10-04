// 静的ファイル配信 + レシート読み取りAPI（依存は @anthropic-ai/sdk と zod のみ）
// 起動: ANTHROPIC_API_KEY=... npm start   → http://localhost:8787
import http from "node:http";
import { createHash, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { readReceipt, ReceiptError } from "./lib/receipt.js";

const PORT = Number(process.env.PORT) || 8787;
const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "public");
const ENABLED = Boolean(process.env.ANTHROPIC_API_KEY);
const MAX_BODY = 8 * 1024 * 1024;
const LIMIT_PER_HOUR = Number(process.env.RECEIPT_LIMIT_PER_HOUR) || 30;
// 合言葉。設定するとレシート読み取りに必須（ブラウザから X-Access-Key ヘッダーで送る）
const ACCESS_KEY = process.env.RECEIPT_ACCESS_KEY || "";
// 中継サーバーの後ろで動かすとき、利用者のIPが入るヘッダー名（例: Render なら true-client-ip）
// 未設定なら接続元アドレスを使う。中継サーバーが上書きしないヘッダーを指定すると偽装されるので注意
const IP_HEADER = (process.env.CLIENT_IP_HEADER || "").toLowerCase();
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json" };

// API利用料の使いすぎ防止: IPごとの簡易レート制限（プロセス内メモリ）
const hits = new Map();
function allow(ip) {
  const now = Date.now();
  if (hits.size > 10_000) for (const [k, v] of hits) if (!v.some(t => now - t < 3600_000)) hits.delete(k);
  const list = (hits.get(ip) || []).filter(t => now - t < 3600_000);
  if (list.length >= LIMIT_PER_HOUR) { hits.set(ip, list); return false; }
  list.push(now); hits.set(ip, list); return true;
}

export function clientIp(req, header = IP_HEADER) {
  const v = header && req.headers[header];
  const first = (Array.isArray(v) ? v[0] : v || "").split(",")[0].trim();
  return first || req.socket.remoteAddress || "unknown";
}

// ブラウザは日本語の合言葉も送れるよう encodeURIComponent して送る
export function decodeKey(v) {
  if (typeof v !== "string") return undefined;
  try { return decodeURIComponent(v); } catch { return undefined; }
}
const digest = s => createHash("sha256").update(String(s)).digest();
export function keyOk(given, expected = ACCESS_KEY) {
  if (!expected) return true;
  return typeof given === "string" && timingSafeEqual(digest(given), digest(expected));
}

const json = (res, status, body) => {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
};

function readBody(req) {
  return new Promise((ok, ng) => {
    let size = 0; const chunks = [];
    req.on("data", c => { size += c.length; if (size > MAX_BODY) { ng(new ReceiptError("too_large", 413)); req.destroy(); } else chunks.push(c); });
    req.on("end", () => ok(Buffer.concat(chunks).toString("utf8")));
    req.on("error", ng);
  });
}

async function api(req, res) {
  if (req.method === "GET") return json(res, 200, { enabled: ENABLED, locked: Boolean(ACCESS_KEY) });
  if (req.method !== "POST") return json(res, 405, { error: "method_not_allowed" });
  if (!ENABLED) return json(res, 503, { error: "disabled" });
  if (!allow(clientIp(req))) return json(res, 429, { error: "rate_limited" }); // 合言葉の総当たりもこの回数に含める
  if (!keyOk(decodeKey(req.headers["x-access-key"]))) return json(res, 401, { error: "unauthorized" });
  try {
    let body;
    try { body = JSON.parse(await readBody(req)); } catch (e) { if (e instanceof ReceiptError) throw e; throw new ReceiptError("bad_request", 400); }
    json(res, 200, await readReceipt(body));
  } catch (e) {
    if (e instanceof ReceiptError) return json(res, e.status, { error: e.code });
    console.error("receipt:", e?.status || "", e?.message || e);
    json(res, 502, { error: "upstream" });
  }
}

async function file(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") { res.writeHead(405); return res.end(); }
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (p.endsWith("/")) p += "index.html";
  const abs = normalize(join(ROOT, p));
  if (!abs.startsWith(ROOT + sep)) { res.writeHead(403); return res.end(); }
  try {
    const data = await readFile(abs);
    // OCR の部品（数MB）は中身が変わらないので長めにキャッシュ
    const cache = p.startsWith("/vendor/") ? "public, max-age=604800" : "no-cache";
    res.writeHead(200, { "Content-Type": TYPES[extname(abs)] || "application/octet-stream", "Cache-Control": cache });
    res.end(req.method === "HEAD" ? undefined : data);
  } catch { res.writeHead(404); res.end("not found"); }
}

export const server = http.createServer((req, res) => {
  const path = new URL(req.url, "http://x").pathname;
  (path === "/api/receipt" ? api : file)(req, res).catch(e => { console.error(e); if (!res.headersSent) { res.writeHead(500); res.end(); } });
});
if (process.argv[1] === fileURLToPath(import.meta.url)) server.listen(PORT, () => console.log(`ズボラ家計簿: http://localhost:${PORT}  (レシート読み取り: ${ENABLED ? "有効" : "無効 — ANTHROPIC_API_KEY 未設定"}${ENABLED && !ACCESS_KEY ? "／合言葉なし" : ""})`));
