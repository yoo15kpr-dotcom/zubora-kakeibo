import { CATS, cat, amount, normalize, split, receiptFromText, hankaku } from "./parse.js";
import { exportData, importData, earliestOffset, earliestMonthKey, backupDue } from "./data.js";

const KEY="zubora_v1";
let S={goal:50000,items:[],recur:[]};
try{const r=localStorage.getItem(KEY);if(r)S=Object.assign(S,JSON.parse(r))}catch(e){}
S.recur=S.recur||[];S.favs=S.favs||[{l:"コンビニ",a:500}];
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(S))}catch(e){}};
const $=id=>document.getElementById(id);
const yen=n=>"¥"+Math.round(n).toLocaleString("ja-JP");
const pick=a=>a[Math.floor(Math.random()*a.length)];
function stats(off=0){
  const d=new Date(),t=new Date(d.getFullYear(),d.getMonth()+off,1),y=t.getFullYear(),mo=t.getMonth();
  const days=new Date(y,mo+1,0).getDate(),day=off==0?d.getDate():days;
  const items=S.items.filter(i=>{const x=new Date(i.ts);return x.getFullYear()==y&&x.getMonth()==mo});
  S.recur.forEach(r=>{if(r.step){const f=new Date(y,mo,1).getTime(),e=new Date(y,mo+1,1).getTime();
    for(let t=new Date(r.anchor);t.getTime()<e;t=new Date(t.getFullYear(),t.getMonth(),t.getDate()+r.step,12))if(t.getTime()>=f)items.push({id:"r"+r.id+t.getTime(),ts:t.getTime(),text:r.label+(r.step==14?"（隔週）":"（毎週）"),amount:r.amount,cat:r.cat,rec:r.id});return}
  if(y*12+mo>=r.start)items.push({id:"r"+r.id,ts:new Date(y,mo,Math.min(r.day,days),12).getTime(),text:r.label+"（毎月）",amount:r.amount,cat:r.cat,rec:r.id})});
  items.sort((a,b)=>a.ts-b.ts);
  const spent=items.reduce((a,i)=>a+i.amount,0);
  return{y,mo,days,day,items,spent,left:S.goal-spent,off};
}
function cheerText(s){
  if(!S.goal)return"目標を決めると、もっとゆるく応援できるよ。";
  const used=s.spent/S.goal,time=s.day/s.days,remDays=s.days-s.day+1;
  const per=Math.max(0,Math.floor(s.left/remDays));
  if(!s.items.length)return"まだ何も使ってないよ。静かな月のはじまり。";
  if(s.left<0)return pick(["超えちゃったけど、ちゃんと記録できてえらい。来月また仕切り直そ〜","まぁそんな月もあるある。記録続けてるだけで十分すごいよ。"]);
  if(used<time-.1)return pick(["いいペース！ちょっと余裕あるね。","えらい、このまま気楽にいこ〜","節約上手。たまにはご褒美もアリだよ。"]);
  if(used<=time+.1)return pick(["ちょうどいい感じ。のんびりいこう。","いい調子。無理せずこのまま〜","バランス良し。お茶でも飲んで一息。"]);
  return pick(["ちょっと使い気味かも。でも1日"+yen(per)+"ならいけるよ。","今日はゆるっと控えめでいこっか。大丈夫、まだ間に合う。","ひと休みしよ。1日"+yen(per)+"めやすでぼちぼち。"]);
}
function render(msg){
  const s=stats(),over=s.left<0;
  $("month").textContent=(s.mo+1)+"月";
  $("goal").textContent=yen(S.goal);
  $("lbl").textContent=over?"目標を超えた分":"目標まであと";
  $("left").textContent=yen(Math.abs(s.left));
  $("left").className="big "+(over?"over":"ok");
  const pct=S.goal?Math.min(100,s.spent/S.goal*100):0;
  $("fill").style.width=pct+"%";$("fill").className=over?"over":"";
  $("pace").style.left=Math.min(99,s.day/s.days*100)+"%";
  $("spent").textContent="使った額 "+yen(s.spent);
  const rem=s.days-s.day+1;
  $("perday").textContent=over?"":"1日 "+yen(Math.max(0,s.left)/rem)+" まで";
  $("cheer").textContent=msg||cheerText(s);
  renderMonth(stats(viewOff));
  if(typeof renderBkDue=="function"){renderBkDue();renderNote()}
}
let selDay=null,viewOff=0;
function renderMonth(s){
  const minOff=Math.max(-60,earliestOffset(S));
  $("h2").textContent=s.y+"年"+(s.mo+1)+"月";
  // 上の ◀▶ とカレンダーの ◀▶ は同じ動き。戻れない／進めない月では薄くする
  for(const id of ["pm","cpm"]){$(id).disabled=viewOff<=minOff;$(id).style.opacity=viewOff<=minOff?.25:1}
  for(const id of ["nm","cnm"]){$(id).disabled=viewOff>=24;$(id).style.opacity=viewOff>=24?.25:1}
  $("calh").textContent=(s.mo+1)+"月（日をタップで絞り込み）";
  $("mtl").textContent=s.off==0?"今月使った金額":"この月に使った金額";
  $("mt").textContent=yen(s.spent);
  $("mc").textContent=s.items.length+"件";
  $("ma").textContent="1日平均 "+yen(s.spent/Math.max(1,s.day));
  const by={};s.items.forEach(i=>by[i.cat]=(by[i.cat]||0)+i.amount);
  const C=$("cats");C.innerHTML="";
  const es=Object.entries(by).sort((a,b)=>b[1]-a[1]);
  if(!es.length)C.innerHTML='<div class="empty">まだ記録なし</div>';
  es.forEach(([k,v])=>{const r=document.createElement("div");r.className="crow";
    r.innerHTML='<span></span><div class="bar"><i></i></div><b></b>';
    r.children[0].textContent=k;r.querySelector("i").style.width=(v/s.spent*100)+"%";r.children[2].textContent=yen(v);C.appendChild(r)});
  const dv=Array(s.days).fill(0);s.items.forEach(i=>dv[new Date(i.ts).getDate()-1]+=i.amount);
  const mx=Math.max(1,...dv),K=v=>v>=10000?(v/10000).toFixed(1).replace(".0","")+"万":v.toLocaleString("ja-JP");
  const cal=$("cal");cal.innerHTML="";
  "日月火水木金土".split("").forEach(w=>{const h=document.createElement("div");h.className="h";h.textContent=w;cal.appendChild(h)});
  for(let i=0;i<new Date(s.y,s.mo,1).getDay();i++){const e=document.createElement("div");e.className="e";cal.appendChild(e)}
  dv.forEach((v,i)=>{const d=i+1,c=document.createElement("div");
    c.className=(s.off==0&&d==s.day?"today ":"")+(d==selDay?"sel":"");
    if(v&&d!=selDay)c.style.background="color-mix(in srgb,var(--ok) "+Math.round(15+v/mx*45)+"%,var(--bg))";
    c.innerHTML="<span></span><small></small>";c.children[0].textContent=d;c.children[1].textContent=v?K(v):"";
    c.onclick=()=>{selDay=selDay==d?null:d;renderMonth(stats(viewOff))};cal.appendChild(c)});
  const li=selDay?s.items.filter(i=>new Date(i.ts).getDate()==selDay):s.items;
  $("lh").textContent=selDay?(s.mo+1)+"月"+selDay+"日の記録（もう一度タップで全部）":"記録一覧";
  const L=$("list");
  if(!li.length){L.innerHTML='<div class="empty">まだ記録なし。上に一言どうぞ。</div>'}
  else{L.innerHTML="";[...li].reverse().slice(0,30).forEach(i=>{
    const d=new Date(i.ts),el=document.createElement("div");el.className="item";
    el.innerHTML='<span class="sub">'+(d.getMonth()+1)+'/'+d.getDate()+'</span><span class="t"></span><span class="tag"></span><b></b><button class="x st" aria-label="リストに入れる">☆</button><button class="x" aria-label="削除">×</button>';
    el.querySelector(".t").textContent=i.text;el.querySelector(".tag").textContent=i.cat;
    el.querySelector("b").textContent=yen(i.amount);
    const st=el.querySelector(".st");
    if(i.rec)st.style.visibility="hidden";else st.onclick=()=>{const l=i.text.replace(/ [\d,]+円$/,"");$("cheer").textContent=addFav(l,i.amount)?"「"+l+" "+i.amount.toLocaleString("ja-JP")+"円」をよく使うリストに入れたよ。":"もうリストに入ってるよ。"};
    el.querySelector(".x:last-child").onclick=()=>{if(i.rec)S.recur=S.recur.filter(r=>r.id!==i.rec);else S.items=S.items.filter(z=>z.id!==i.id);save();render(i.rec?"毎月の登録をやめたよ。":"消しておいたよ。")};
    L.appendChild(el)})}
}
function tab(n){$("v1").hidden=n!=1;$("v2").hidden=n!=2;$("t1").className=n==1?"on":"";$("t2").className=n==2?"on":"";window.scrollTo(0,0)}
// 記録のある一番古い月まで戻れる（最大5年）
const prevMonth=()=>{if(viewOff>Math.max(-60,earliestOffset(S))){viewOff--;selDay=null;renderMonth(stats(viewOff))}};
const nextMonth=()=>{if(viewOff<24){viewOff++;selDay=null;renderMonth(stats(viewOff))}};
$("pm").onclick=$("cpm").onclick=prevMonth;$("nm").onclick=$("cnm").onclick=nextMonth;
$("t1").onclick=()=>tab(1);$("t2").onclick=()=>tab(2);

// バックアップ: 書き出しは共有シート（iPhone は「ファイルに保存」できる）かダウンロード。読み込みは今のデータに足す
const bkMsg=t=>{$("bkmsg").textContent=t};
// 書き出しの記録（家計簿データとは別のキー）: last=最後に書き出した時刻, snooze=「あとで」を押した日
const BKKEY="zubora_bk";
let BK={};try{BK=JSON.parse(localStorage.getItem(BKKEY))||{}}catch(e){}
const saveBk=()=>{try{localStorage.setItem(BKKEY,JSON.stringify(BK))}catch(e){}};
const ymd=d=>d.getFullYear()+"-"+(d.getMonth()+1)+"-"+d.getDate();
const lastBkText=()=>BK.last?"最後に書き出した日: "+(new Date(BK.last).getMonth()+1)+"/"+new Date(BK.last).getDate():"記録はこのスマホの中だけにあるよ。ときどき書き出しておくと安心。";
// 書き出す。保存できた（と思われる）ら true
async function doExport(){
  const d=new Date(),name="zubora-kakeibo-"+d.getFullYear()+String(d.getMonth()+1).padStart(2,"0")+String(d.getDate()).padStart(2,"0")+".json";
  const blob=new Blob([exportData(S,d)],{type:"application/json"});
  let done=false;
  try{const f=new File([blob],name,{type:"application/json"});if(navigator.canShare&&navigator.canShare({files:[f]})){await navigator.share({files:[f],title:"ズボラ家計簿のバックアップ"});done=true}}
  catch(e){if(e&&e.name=="AbortError")return false}
  if(!done){const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),5000)}
  BK.last=Date.now();saveBk();renderBkDue();
  return true;
}
// 月末（忘れていたら翌月）に入力画面の上でバックアップを促す
function renderBkDue(){
  const now=new Date(),r=backupDue(now,BK.last||0,earliestMonthKey(S));
  const show=r.due&&BK.snooze!==ymd(now);
  $("bkdue").hidden=!show;
  if(show)$("bkduet").textContent="📦 "+(r.m+1)+"月分のバックアップをとろう。1タップで保存できるよ。";
  if($("bkmsg").dataset.fixed!="1")$("bkmsg").textContent=lastBkText();
}
$("bkout").onclick=async()=>{if(await doExport()){$("bkmsg").dataset.fixed="1";bkMsg("書き出したよ。"+lastBkText().replace("最後に書き出した日: ","（")+"）")}};
$("bkdueok").onclick=async()=>{if(await doExport())$("cheer").textContent="バックアップしたよ。えらい、これで安心〜"};
$("bkduelater").onclick=()=>{BK.snooze=ymd(new Date());saveBk();renderBkDue()};

// iPhone では Safari とホーム画面のアイコンで保存場所が別（Apple の仕様）。記録が「消えた」ように見えないよう案内する
const isIOS=/iPhone|iPad|iPod/.test(navigator.userAgent)||(navigator.platform=="MacIntel"&&navigator.maxTouchPoints>1);
const standalone=navigator.standalone===true||(window.matchMedia&&matchMedia("(display-mode: standalone)").matches);
function renderNote(){
  let t="";
  if(isIOS&&!BK.noteOk){
    if(!standalone)t="📱 ホーム画面のアイコンから開くのがおすすめ。iPhoneでは、Safariとホーム画面のアイコンで記録が別々に保存されるよ（いつも同じほうで開いてね）。";
    else if(!S.items.length&&!S.recur.length)t="📱 Safariで使っていた記録や「よく使う」は、Safariで「今月」→「⬇ 書き出す」、ここで「⬆ 読み込む」で移せるよ。";
  }
  $("iosnote").hidden=!t;if(t)$("iosnotet").textContent=t;
}
$("iosnoteok").onclick=()=>{BK.noteOk=true;saveBk();renderNote()};
$("bkin").onclick=()=>$("bkfile").click();
$("bkfile").onchange=async e=>{
  const f=e.target.files[0];e.target.value="";if(!f)return;
  try{const r=importData(S,await f.text());S=Object.assign(S,r.data);save();renderFavs();render();
    const n=r.added.items+r.added.recur;bkMsg(n||r.added.favs?"読み込んだよ。記録 "+r.added.items+"件、繰り返し "+r.added.recur+"件、よく使う "+r.added.favs+"件を足したよ。":"新しい記録はなかったよ（もう入ってた）。")}
  catch(err){bkMsg("このファイルは読み込めなかったよ。書き出したバックアップ（.json）を選んでね。")}
};

// レシート読み取り: サーバーの /api/receipt（APIキーはサーバー側）。使えるときだけ📷を出す
const RCPT_API="api/receipt",KKEY="zubora_key";
// 合言葉（サーバーで RECEIPT_ACCESS_KEY を設定したときだけ必要）。家計簿データとは別のキーに保存
let rcLocked=false;
const getKey=()=>{try{return localStorage.getItem(KKEY)||""}catch(e){return""}};
const setKey=k=>{try{k?localStorage.setItem(KKEY,k):localStorage.removeItem(KKEY)}catch(e){}};
{const m=location.hash.match(/(?:^#|&)key=([^&]+)/);if(m){setKey(decodeURIComponent(m[1]));history.replaceState(null,"",location.pathname+location.search)}}
// 読み取り方法: サーバーにAPIキーがあれば API、なければ端末内の文字認識（無料・画像は端末の外に出ない）
let rcMode=null;
// Worker 内で解決されるので絶対URLにする
const OCR=new URL("vendor/ocr/",location.href).href;
(async()=>{
  try{const r=await fetch(RCPT_API,{cache:"no-store"});const j=r.ok&&await r.json();if(j&&j.enabled){rcLocked=!!j.locked;rcMode="api"}}catch(e){}
  if(!rcMode)try{const r=await fetch(OCR+"tesseract.min.js",{method:"HEAD",cache:"no-store"});if(r.ok)rcMode="local"}catch(e){}
  if(rcMode)$("rcpt").hidden=false;
})();
function askKey(msg){
  const box=$("rc");box.hidden=false;box.innerHTML="";
  const p=document.createElement("div");p.textContent=msg;
  const inp=document.createElement("input");inp.className="goalin";inp.style.width="100%";inp.style.marginTop="8px";inp.type="password";inp.autocomplete="off";inp.setAttribute("aria-label","合言葉");
  const acts=document.createElement("div");acts.className="acts";
  const ok=document.createElement("button");ok.className="btn";ok.textContent="覚えておく";
  const no=document.createElement("button");no.className="btn no";no.textContent="やめる";
  const go=()=>{const k=inp.value.trim();if(!k)return;setKey(k);box.hidden=true;$("file").click()};
  ok.onclick=go;inp.addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.isComposing)go()});no.onclick=()=>{box.hidden=true};
  acts.append(ok,no);box.append(p,inp,acts);inp.focus();
}
// 画像を長辺 max px に縮めた canvas にする
async function toCanvas(f,max,deg=0){
  const b=await createImageBitmap(f),k=Math.min(1,max/Math.max(b.width,b.height)),w=Math.round(b.width*k),h=Math.round(b.height*k);
  const c=document.createElement("canvas");c.width=deg%180?h:w;c.height=deg%180?w:h;
  const x=c.getContext("2d");x.translate(c.width/2,c.height/2);x.rotate(deg*Math.PI/180);x.drawImage(b,-w/2,-h/2,w,h);b.close&&b.close();return c;
}
// API用: 長辺1568pxのJPEGに縮めてから送る
async function shrink(f){
  try{const u=(await toCanvas(f,1568)).toDataURL("image/jpeg",.85);return{mediaType:"image/jpeg",image:u.slice(u.indexOf(",")+1)}}
  catch(e){
    const u=await new Promise((ok,ng)=>{const r=new FileReader();r.onload=()=>ok(r.result);r.onerror=ng;r.readAsDataURL(f)});
    return{mediaType:f.type,image:u.slice(u.indexOf(",")+1)};
  }
}
// 文字認識の前処理: 白黒にしてコントラストを上げる（実物のレシートで合計の誤読が減った）。
// canvas の filter は端末によって効かないので、画素を直接計算する
function prep(c){
  const x=c.getContext("2d"),im=x.getImageData(0,0,c.width,c.height),d=im.data;
  for(let i=0;i<d.length;i+=4){let y=(d[i]*.299+d[i+1]*.587+d[i+2]*.114-128)*1.6+128;y=y<0?0:y>255?255:y;d[i]=d[i+1]=d[i+2]=y}
  x.putImageData(im,0,0);return c;
}
// 端末内の文字認識（Tesseract.js）。初回だけ部品（数MB）を読み込む
let ocrWorker=null;
function loadScript(src){return new Promise((ok,ng)=>{const s=document.createElement("script");s.src=src;s.onload=ok;s.onerror=ng;document.head.appendChild(s)})}
let ocrLabel="文字を読んでるよ…";
async function localOcr(f,box){
  if(!ocrWorker){
    if(!window.Tesseract)await loadScript(OCR+"tesseract.min.js");
    ocrWorker=window.Tesseract.createWorker("jpn",1,{workerPath:OCR+"worker.min.js",corePath:OCR+"core",langPath:OCR+"lang",gzip:true,workerBlobURL:false,
      logger:m=>{if(m.status=="recognizing text")box.textContent=ocrLabel+" "+Math.round(m.progress*100)+"%"}});
  }
  const w=await ocrWorker;
  // まずそのまま読む。合計が見つからなければ、向きを変えて読み直す（横長の写真は横向きに置かれたレシートとみて90°/270°から）
  let land=false;try{const b=await createImageBitmap(f);land=b.width>b.height;b.close&&b.close()}catch(e){}
  let best=null;
  for(const deg of land?[0,90,270,180]:[0,180,90,270]){
    ocrLabel=deg?"向きを変えて読み直してるよ…":"文字を読んでるよ…";
    const c=await toCanvas(f,2400,deg).then(prep).catch(()=>null);
    if(!c){if(deg)break;const {data}=await w.recognize(f);return receiptFromText(data.text)}
    const r=receiptFromText((await w.recognize(c)).data.text);
    if(!best||(r.total&&!best.total)||(!best.total&&!best.date&&r.date))best=r;
    if(r.total)break;
  }
  return best;
}
// 読み取り結果の確認。店名と金額はその場で直せる
function showReceipt(r){
  const box=$("rc");box.hidden=false;box.innerHTML="";
  const t=Math.round(+r.total||0);
  const head=document.createElement("div");head.textContent=t?"これで合ってる？（直せるよ）":"合計が読み取れなかったよ。金額だけ入れてね。";
  const row=document.createElement("div");row.className="rcrow";
  const st=document.createElement("input");st.className="goalin";st.value=r.store||"";st.placeholder="お店";st.setAttribute("aria-label","お店");
  const am=document.createElement("input");am.className="goalin";am.inputMode="numeric";am.value=t||"";am.placeholder="金額";am.setAttribute("aria-label","金額");
  row.append(st,am);
  const info=document.createElement("div");info.className="sub";info.textContent=(r.category||"その他")+(r.date?"・"+r.date:"");
  const acts=document.createElement("div");acts.className="acts";
  const ok=document.createElement("button");ok.className="btn";ok.textContent="記録する";
  const no=document.createElement("button");no.className="btn no";no.textContent="やめる";
  const go=()=>{const a=amount(am.value);if(!a){am.focus();return}
    const name=st.value.trim()||"レシート";let ts=Date.now();if(r.date&&!isNaN(Date.parse(r.date)))ts=Date.parse(r.date)+43200000;
    S.items.push({id:ts+Math.random(),ts,text:name+"（レシート）",amount:a,cat:CATS.some(c=>c[0]==r.category)||r.category=="その他"?r.category:"その他"});
    save();box.hidden=true;render(yen(a)+" 記録したよ。"+cheerText(stats()))};
  ok.onclick=go;am.addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.isComposing)go()});no.onclick=()=>{box.hidden=true};
  acts.append(ok,no);box.append(head,row,info,acts);if(!t)am.focus();
}
$("rcpt").onclick=()=>{if(rcMode=="api"&&rcLocked&&!getKey())askKey("合言葉を入れてね（最初の1回だけ）。");else $("file").click()};
$("file").onchange=async e=>{
  const f=e.target.files[0];e.target.value="";if(!f)return;
  const box=$("rc");box.hidden=false;box.textContent=rcMode=="local"&&!ocrWorker?"読み取りの準備中…（初回だけ少し時間がかかるよ）":"レシートを読んでるよ…少し待ってね。";
  try{
    if(rcMode=="local"){showReceipt(await localOcr(f,box));return}
    const res=await fetch(RCPT_API,{method:"POST",headers:{"Content-Type":"application/json","X-Access-Key":encodeURIComponent(getKey())},body:JSON.stringify(await shrink(f))});
    const r=await res.json().catch(()=>({}));
    if(!res.ok)throw r;
    showReceipt(r);
  }catch(err){
    if(err&&err.error=="unauthorized"){setKey("");rcLocked=true;askKey("合言葉がちがうみたい。もう一度入れてね。");return}
    if(rcMode=="local"){ocrWorker=null;box.textContent=!navigator.onLine?"初回の準備には電波が必要だよ。電波のあるところでもう一度ためしてね。":"うまく読めなかった。明るい所でまっすぐ撮るか、文字をコピーして入力欄に貼ってみて。";return}
    box.textContent=!navigator.onLine?"オフラインみたい。電波のあるところでもう一度ためしてね。":err&&err.error=="too_large"?"写真が大きすぎたみたい。もう一度撮ってみて。":err&&err.error=="rate_limited"?"ちょっと読みすぎたかも。1時間くらいあけてね。":"うまく読めなかった。もう一度ためしてね。"}
};
function submit(t){
  t=(t||$("txt").value).trim();if(!t)return;
  if(/合計|お会計|御会計|ご請求/.test(t)&&(hankaku(t).match(/\d+/g)||[]).length>=3){const r=receiptFromText(t);if(r.total){$("txt").value="";showReceipt(r);return}}
  const list=split(normalize(t));
  if(!list.length){$("cheer").textContent="金額が見つからなかったよ。「ランチ800円」みたいに言ってみて。";return}
  const d=new Date(),sk=d.getFullYear()*12+d.getMonth();let tot=0,rn=[],auto=[];
  list.forEach((z,i)=>{
    if(z.rec&&z.rec.step){const wd=z.rec.wd,A=new Date(d.getFullYear(),d.getMonth(),d.getDate()+(wd==null?0:(wd-d.getDay()+7)%7),12);
      S.recur.push({id:Date.now()+i+Math.random(),label:z.label,amount:z.a,step:z.rec.step,anchor:A.getTime(),cat:cat(z.label),start:sk});
      rn.push((z.rec.step==14?"隔週":"毎週")+(wd==null?"":"日月火水木金土"[wd]+"曜")+" "+z.label+" "+yen(z.a))}
    else if(z.rec){S.recur.push({id:Date.now()+i+Math.random(),label:z.label,amount:z.a,day:Math.min(31,z.rec.day),cat:cat(z.label),start:sk});rn.push("毎月"+z.rec.day+"日 "+z.label+" "+yen(z.a))}
    else{tot+=z.a;const tx=z.label+" "+yen(z.a).slice(1)+"円",bf=S.items.filter(x=>x.text==tx).length;
      S.items.push({id:Date.now()+i+Math.random(),ts:z.ts||Date.now(),text:tx,amount:z.a,cat:cat(z.label)});
      if(bf==1&&addFav(z.label,z.a))auto.push(z.label+" "+yen(z.a))}
  });
  save();$("txt").value="";
  const n1=list.length-rn.length;
  render((n1?(n1>1?n1+"件、":"")+yen(tot)+" 記録したよ。":"")+(rn.length?rn.join("、")+" を登録したよ。":"")+(auto.length?"「"+auto.join("、")+"」、よく使いそうだからリストに入れといたよ〜":cheerText(stats())));
}
$("add").onclick=()=>submit();
$("txt").addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.isComposing)submit()});

// 目標金額: タップでその場の入力欄に切り替え（prompt() は埋め込み環境で動かないことがあるため使わない）
const gi=$("goalin");let goalOpen=false;
function goalDone(apply){
  if(!goalOpen)return;goalOpen=false;
  const n=apply?amount(gi.value):0;
  gi.hidden=true;$("goal").hidden=false;
  if(n>0){S.goal=n;save();render("目標を "+yen(n)+" にしたよ。")}
}
$("goal").onclick=()=>{goalOpen=true;gi.value=S.goal;$("goal").hidden=true;gi.hidden=false;gi.focus();gi.select()};
gi.addEventListener("keydown",e=>{if(e.isComposing)return;if(e.key==="Enter")goalDone(true);else if(e.key==="Escape")goalDone(false)});
gi.addEventListener("blur",()=>goalDone(true));

let favEdit=false;
function addFav(l,a){if(!l||!a||S.favs.some(f=>f.l==l&&f.a==a))return false;S.favs.push({l,a});save();renderFavs();return true}
function renderFavs(){
  const C=$("chips");C.innerHTML="";
  S.favs.forEach((f,i)=>{const b=document.createElement("button");b.textContent=(favEdit?"× ":"")+f.l+" "+f.a.toLocaleString("ja-JP")+"円";
    b.onclick=()=>{if(favEdit){S.favs.splice(i,1);save();renderFavs()}else submit(f.l+f.a+"円")};C.appendChild(b)});
  if(!S.favs.length)C.innerHTML='<span class="sub">まだ空っぽ。同じものを2回記録すると自動で入るよ（今月の記録一覧の☆でも入れられるよ）。</span>';
  $("favedit").textContent=favEdit?"✓ 完了":"✎ 編集";
}
$("favedit").onclick=()=>{favEdit=!favEdit;renderFavs()};

// 音声入力: ブラウザの音声認識が使えればそれで聞き取って記録。
// 使えない環境（非対応ブラウザ、マイク不可の埋め込み画面など）では、キーボードのマイクで話してもらう
function dictateHint(){$("txt").focus();$("cheer").textContent="キーボードのマイクで話してね。終わったら「記録」をタップ。"}
const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
if(!SR){$("mic").onclick=dictateHint}
else{
  const r=new SR();r.lang="ja-JP";r.interimResults=false;let on=false;
  const off=()=>{on=false;$("mic").classList.remove("on")};
  r.onresult=e=>{const t=e.results[0][0].transcript;$("txt").value=t;submit(t)};
  r.onend=off;
  r.onerror=e=>{off();if(/not-allowed|service-not-allowed|audio-capture|network/.test(e.error))dictateHint();else if(e.error=="no-speech")$("cheer").textContent="聞き取れなかったよ。もう一度🎤を押して話してね。"};
  $("mic").onclick=()=>{if(on){r.stop();return}try{r.start();on=true;$("mic").classList.add("on");$("cheer").textContent="聞いてるよ…話してね。"}catch(e){off();dictateHint()}};
}
renderFavs();render();

if("serviceWorker" in navigator)navigator.serviceWorker.register("sw.js").catch(()=>{});
