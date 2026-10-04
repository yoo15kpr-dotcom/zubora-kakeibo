// 入力の解釈ロジック（DOM非依存。ブラウザと Node のテストで共用）
export const CATS=[["食費",/ランチ|ご飯|ごはん|昼|朝|夜|夕|飯|カフェ|コーヒー|スタバ|居酒屋|ラーメン|弁当|コンビニ|おやつ|お菓子|スーパー|食|飲み|ビール|パン/],
["交通",/電車|バス|タクシー|ガソリン|交通|駐車|suica|スイカ|定期/i],
["日用品",/洗剤|ティッシュ|日用|ドラッグ|薬|シャンプー|トイレ/],
["趣味",/映画|本|ゲーム|漫画|マンガ|服|趣味|ライブ|課金|グッズ|買い物/],
["固定費",/家賃|電気|ガス|水道|通信|スマホ|サブスク|保険|ネット/]];
export const cat=t=>{for(const[c,r]of CATS)if(r.test(t))return c;return"その他"};
export const hankaku=t=>t.replace(/[０-９]/g,c=>String.fromCharCode(c.charCodeAt(0)-65248));
export function amount(t){
  t=hankaku(t).replace(/[,、，]/g,"");
  let m,n=0,f=false;
  if(m=t.match(/(\d+)?\s*万/)){n+=(m[1]?+m[1]:1)*10000;f=true;t=t.replace(m[0],"")}
  if(m=t.match(/(\d+)?\s*千/)){n+=(m[1]?+m[1]:1)*1000;f=true;t=t.replace(m[0],"")}
  if(m=t.match(/\d+/)){n+=+m[0];f=true}
  return f?n:0;
}
// 全角数字を半角化し、改行を空白に、円のない金額に「円」を補う（submit と ☆ボタン共通）
export function normalize(t){
  t=hankaku(t).replace(/[\r\n]+/g," ");
  return t.replace(/(\d[\d,]*(?:万(?:\d+千?)?|千)?)(?![\d,万千日円])/g,"$1円");
}
export function dateOf(g,now=new Date()){
  g=hankaku(g);
  const n=now,Y=n.getFullYear(),M=n.getMonth(),D=n.getDate();let d=null,m;
  if(m=g.match(/(隔週|毎週)\s*(?:([月火水木金土日])曜日?)?/))return{ts:null,rest:g.replace(m[0]," "),rec:{step:m[1]=="隔週"?14:7,wd:m[2]?"日月火水木金土".indexOf(m[2]):null}};
  if(m=g.match(/毎月\s*(\d{1,2})?\s*日?/))return{ts:null,rest:g.replace(m[0]," "),rec:{day:m[1]?+m[1]:D}};
  if(m=g.match(/(来月)?\s*(\d{1,2})日/)){d=new Date(Y,M+(m[1]?1:0),+m[2],12);g=g.replace(m[0]," ")}
  else if(/明後日|あさって/.test(g)){d=new Date(Y,M,D+2,12);g=g.replace(/明後日|あさって/," ")}
  else if(/明日|あした/.test(g)){d=new Date(Y,M,D+1,12);g=g.replace(/明日|あした/," ")}
  else if(/来月/.test(g)){d=new Date(Y,M+1,1,12);g=g.replace("来月"," ")}
  g=g.replace(/今日|きょう/," ");
  return{ts:d?d.getTime():null,rest:g};
}
export function split(t,now=new Date()){
  const segs=(t.match(/[^円]*円(?:\s*(?:毎月\s*\d{0,2}\s*日?|(?:隔週|毎週)\s*(?:[月火水木金土日]曜日?)?))?|[^円]+$/g)||[]).map(x=>x.trim()).filter(Boolean);
  const out=[];let last="",cts=null;
  for(let g of segs){
    const dd=dateOf(g,now);if(dd.ts)cts=dd.ts;g=dd.rest;const rec=dd.rec||null;
    const a=amount(g);if(!a)continue;
    let label=g.replace(/[０-９0-9,，、.]+|[万千]|円|えん/g," ").replace(/[\s　]+/g," ").trim();
    label=label.replace(/^[、,＋+\s]+/,"").replace(/^(と|や)(?=[゠-ヿ一-鿿])/,"").replace(/^(と|や)$/,"").replace(/[、,＋+\s]+$/,"").replace(/で$/,"").trim();
    if(!label)label=last;else last=label;
    out.push({a,label:label||"支出",ts:cts,rec});
  }
  return out;
}

// ---- レシートの文字（端末の文字認識の結果や、貼り付けたテキスト）→ {store, total, date, category}
// 文字認識の癖: 文字の間の空白、¥が「\」、桁区切りの「,」が「.」になる
const TOTAL_WORDS=[/お?買上合計|お会計|御会計|ご請求額?|請求金額|お支払(?:合計|金額)?|支払合計|総合計|合計金額|合計/,/総額|税込計/];
const NOT_TOTAL=/小計|対象|内税|消費税|税額|預り|預かり|釣り|つり|現金|点数|割引|値引|ポイント/;
const STORE_HINTS=[["食費",/ローソン|ファミリーマート|ファミマ|セブン|ミニストップ|デイリーヤマザキ|イオン|西友|ライフ|まいばすけっと|業務スーパー|マクドナルド|すき家|吉野家|松屋|ガスト|サイゼリヤ|スターバックス|ドトール|タリーズ|おにぎり|弁当|ラーメン|餃子|定食|ランチ/],
["日用品",/マツモトキヨシ|マツキヨ|ウエルシア|ツルハ|スギ薬局|サンドラッグ|ココカラ|ダイソー|セリア|ニトリ|無印良品|薬局/],
["交通",/ENEOS|エネオス|出光|コスモ石油|パーキング|駐車/i]];
const yenNum=s=>{s=s.replace(/[,，]/g,"").replace(/\.(?=\d{3}(?!\d))/g,"");const n=Math.round(+s);return Number.isFinite(n)?n:0};
export function receiptFromText(raw){
  let t=hankaku(String(raw||"")).replace(/[￥\\]/g,"¥").replace(/[：]/g,":").replace(/(?<=\d[,.]?\d*)[oO](?=[\doO,.]*)/g,"0");
  const rawLines=String(raw||"").split(/\r?\n/);
  // 日本語どうしの間の空白を詰める（数字の前後の空白は残す）
  for(let i=0;i<3;i++)t=t.replace(/([^\x00-\x7F])[ \t　]+(?=[^\x00-\x7F])/g,"$1");
  const lines=t.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
  // 合計: 強い言葉→弱い言葉の順に探し、同じ強さなら後ろにあるものを採る。「小計」などは除外
  let total=0,totalYen=false;
  const amountAfter=/[^\d¥]{0,8}¥?\s*(\d{1,3}(?:[.,]\d{3})+|\d+)(?!\s*点)/g;
  for(const w of TOTAL_WORDS){
    const re=new RegExp("("+w.source+")"+amountAfter.source,"g");let m,found=0;
    for(const l of lines.length>1?lines:[t]){
      if(NOT_TOTAL.test(l.replace(w," ")))continue; // 例:「小計」「合計点数」の行は使わない（1行に全部ある場合は下で判定）
      re.lastIndex=0;while(m=re.exec(l)){if(!NOT_TOTAL.test(m[0])){const n=yenNum(m[2]);if(n>0){found=n;totalYen=m[0].includes("¥")}}}
    }
    if(!found&&lines.length<=1){re.lastIndex=0;while(m=re.exec(t)){const pre=t.slice(Math.max(0,m.index-2),m.index);if(!/小|総/.test(pre)||/総/.test(m[1])){const n=yenNum(m[2]);if(n>0){found=n;totalYen=m[0].includes("¥")}}}}
    if(found){total=found;break}
  }
  // 先頭の桁が抜ける読み違い（¥179,000 → 79,000。「¥1」がまとめて崩れる）を、後ろの支払・預りの金額で補う。
  // 他の行には¥があるのに合計にだけ¥がない＝崩れた形跡があるときに限る（合計¥500・預り¥1,500 を誤って直さない）
  if(total&&!totalYen&&/¥/.test(t)){
    const pays=[],ti=lines.findIndex(l=>TOTAL_WORDS[0].test(l)&&!NOT_TOTAL.test(l.replace(TOTAL_WORDS[0]," "))&&l.includes(String(total).slice(-3)));
    lines.forEach((l,i)=>{if(/預り|預かり|対象|PayPay|クレジット|カード|電子マネー|現金|お支払|支払/i.test(l)||(ti>=0&&i>ti&&i<=ti+8))for(const x of l.match(/\d{1,3}(?:[.,]\d{3})+|\d{3,}/g)||[])pays.push(yenNum(x))});
    const better=pays.filter(n=>n>total&&String(n).endsWith(String(total))).sort((a,b)=>a-b)[0];
    if(better)total=better;
  }
  // 日付
  let date=null,m;
  const ok=(y,mo,d)=>{if(y<100)y+=2000;const x=new Date(y,mo-1,d);return x.getFullYear()==y&&x.getMonth()==mo-1&&x.getDate()==d&&y>=2000?`${y}-${String(mo).padStart(2,"0")}-${String(d).padStart(2,"0")}`:null};
  if(m=t.match(/令和\s*(\d{1,2})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/))date=ok(2018+ +m[1],+m[2],+m[3]);
  if(!date&&(m=t.match(/(20\d{2})\s*[年\/\-.]\s*(\d{1,2})\s*[月\/\-.]\s*(\d{1,2})/)))date=ok(+m[1],+m[2],+m[3]);
  if(!date&&(m=t.match(/(?<!\d)(\d{2})[\/.](\d{1,2})[\/.](\d{1,2})(?!\d)/)))date=ok(+m[1],+m[2],+m[3]);
  // 店名: 先頭から、電話・日付・番号・金額でない最初の行
  let store="";
  for(const r of rawLines){const sm=hankaku(r).match(/([^\s\d¥\\:]{1,12})\s*店\s*(?:TEL|tel|電話|☎)/);if(sm){store=sm[1]+"店";break}}
  const garbled=i=>{const w=(rawLines[i]||"").trim().split(/\s+/).filter(Boolean);return w.length>=4&&w.filter(x=>x.length==1).length/w.length>=.7};
  if(!store)for(const [i,l] of (lines.length>1?lines:[t.split(/\s+/)[0]||""]).entries()){
    if(lines.length>1&&garbled(rawLines.findIndex(r=>r.trim()&&r.replace(/\s+/g,"")===l.replace(/\s+/g,""))))continue;
    if(/電話|TEL|tel|〒|レジ|No\.|[#№]|^\d|¥|年.*月|\/\d|領収|レシート|\d{2,}\s*円?$/.test(l))continue;
    if(l.replace(/[\s\d\p{P}\p{S}]/gu,"").length>=2){store=l.replace(/\s+/g,"").slice(0,30);break}
  }
  // カテゴリ: 既知の店・品名のキーワード → 店名から判定。誤読の多い全文には汎用の判定を使わない
  let category="その他";
  for(const[c,r]of STORE_HINTS)if(r.test(t)){category=c;break}
  if(category=="その他"&&store)category=cat(store);
  return{store,total,date,category};
}
