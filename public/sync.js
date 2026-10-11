// 2人で同じ家計簿を使うための同期（DOM非依存。ブラウザと Node のテストで共用）
// ・記録は招待リンクに入っている鍵（乱数）でこの端末の中で暗号化してから送る。サーバーは中身を読めない
// ・まとめ方は「足し算＋消した印」。どちらの順番でまとめても同じ結果になり、同時に入力しても消えない
import { okItem, okRecur, okFav } from "./data.js";

const isNum = x => typeof x == "number" && Number.isFinite(x);
const favKey = f => "f:" + f.a + ":" + f.l;
export const delKey = {
  item: id => "i:" + String(id),
  recur: id => "r:" + String(id),
  fav: (l, a) => favKey({ l, a }),
};

// 家計簿どうしをまとめる。記録・繰り返しは足し算、消した印（del）があるものは消す。
// よく使う（favs）は「最後に入れた時刻（t）」が消した時刻より新しければ残す。目標金額は新しく変えたほう
export function mergeState(a, b) {
  a = a || {}; b = b || {};
  const del = {};
  for (const src of [a.del, b.del]) for (const [k, t] of Object.entries(src || {})) if (isNum(t) && !(del[k] >= t)) del[k] = t;
  const items = new Map(), recur = new Map(), favs = new Map();
  // 同じ id が2つあれば（普通は起きない）文字列で大きいほう。どちらの順番でまとめても同じ結果にするため
  const pick = (m, x) => { const k = String(x.id), o = m.get(k); if (!o || JSON.stringify(x) > JSON.stringify(o)) m.set(k, x); };
  for (const i of [...(a.items || []), ...(b.items || [])]) if (okItem(i)) pick(items, i);
  for (const r of [...(a.recur || []), ...(b.recur || [])]) if (okRecur(r)) pick(recur, r);
  for (const f of [...(a.favs || []), ...(b.favs || [])]) {
    if (!okFav(f)) continue;
    const k = favKey(f), o = favs.get(k);
    if (!o || (f.t || 0) > (o.t || 0)) favs.set(k, f);
  }
  const ga = { v: a.goal, t: isNum(a.goalTs) ? a.goalTs : 0 }, gb = { v: b.goal, t: isNum(b.goalTs) ? b.goalTs : 0 };
  const okGoal = g => isNum(g.v) && g.v > 0;
  let g = okGoal(ga) ? ga : gb;
  if (okGoal(gb) && (gb.t > g.t || (gb.t == g.t && gb.v > g.v))) g = gb;
  return {
    goal: okGoal(g) ? g.v : 50000, goalTs: okGoal(g) ? g.t : 0,
    items: [...items.values()].filter(i => !del[delKey.item(i.id)]),
    recur: [...recur.values()].filter(r => !del[delKey.recur(r.id)]),
    favs: [...favs.values()].filter(f => !(del[favKey(f)] >= (f.t || 0))),
    del,
  };
}

// 中身が同じかどうかを並び順に関係なく比べるための文字列
export function canon(s) {
  s = mergeState(s, null);
  const by = k => (x, y) => (k(x) < k(y) ? -1 : k(x) > k(y) ? 1 : 0);
  return JSON.stringify({
    goal: s.goal, goalTs: s.goalTs,
    items: [...s.items].sort(by(i => String(i.id))),
    recur: [...s.recur].sort(by(r => String(r.id))),
    favs: [...s.favs].sort(by(favKey)).map(f => [favKey(f), f.t || 0]),
    del: Object.entries(s.del).sort(by(e => e[0])),
  });
}

// ---- 暗号化（WebCrypto。ブラウザと Node 20 以降で同じように動く）
const te = new TextEncoder(), td = new TextDecoder();
function b64(u8) { let s = ""; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); }
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const b64url = u8 => b64(u8).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64url = s => unb64(s.replace(/-/g, "+").replace(/_/g, "/"));
const hex = buf => [...new Uint8Array(buf)].map(x => x.toString(16).padStart(2, "0")).join("");

// 招待リンクに入れる鍵（128ビットの乱数）
export const SECRET_RE = /^[A-Za-z0-9_-]{22,64}$/;
export const newSecret = () => b64url(crypto.getRandomValues(new Uint8Array(16)));
// 招待リンクやその一部（#join=...）から鍵を取り出す。なければ null
export function secretFromText(t) {
  const m = String(t || "").match(/#join=([A-Za-z0-9_-]{22,64})(?![A-Za-z0-9_-])/);
  return m ? m[1] : null;
}

// 鍵から「暗号化の鍵」と「サーバーに見せる合図（token）」を別々に作る。token からは暗号化の鍵は分からない
export async function keysFrom(secret) {
  if (!SECRET_RE.test(secret)) throw new Error("bad_secret");
  const base = await crypto.subtle.importKey("raw", unb64url(secret), "HKDF", false, ["deriveKey", "deriveBits"]);
  const salt = te.encode("zubora-kakeibo-sync-v1");
  const key = await crypto.subtle.deriveKey({ name: "HKDF", hash: "SHA-256", salt, info: te.encode("enc") }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  const token = hex(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info: te.encode("auth") }, base, 256));
  return { key, token };
}

export async function seal(obj, key) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, te.encode(JSON.stringify(obj)));
  return { v: 1, iv: b64(iv), ct: b64(new Uint8Array(ct)) };
}

export async function unseal(env, key) {
  if (!env || env.v !== 1 || typeof env.iv != "string" || typeof env.ct != "string") throw new Error("bad_data");
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(env.iv) }, key, unb64(env.ct));
  return JSON.parse(td.decode(pt));
}
