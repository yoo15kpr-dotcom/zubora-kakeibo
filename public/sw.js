// オフライン対応: アプリ本体は「ネット優先・だめならキャッシュ」、フォントは「キャッシュ優先」
const CACHE="zubora-v5";
const SHELL=["./","index.html","style.css","app.js","parse.js","data.js","manifest.webmanifest","icons/icon.svg","icons/icon-192.png","icons/icon-512.png","icons/apple-touch-icon.png"];
self.addEventListener("install",e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()))});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k.startsWith("zubora-")&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener("fetch",e=>{
  const q=e.request,u=new URL(q.url);
  if(q.method!=="GET")return;
  if(u.origin===location.origin){
    if(u.pathname.includes("/api/"))return; // レシートAPIはキャッシュしない
    if(u.pathname.includes("/vendor/")){ // 文字認識の部品: 一度取れたらキャッシュを使う（初回は使ったときに保存）
      e.respondWith(caches.match(q).then(r=>r||fetch(q).then(r=>{if(r.ok){const c=r.clone();caches.open(CACHE).then(x=>x.put(q,c))}return r})));return;
    }
    e.respondWith(fetch(q).then(r=>{if(r.ok){const c=r.clone();caches.open(CACHE).then(x=>x.put(q,c))}return r})
      .catch(()=>caches.match(q,{ignoreSearch:true}).then(r=>r||(q.mode==="navigate"?caches.match("index.html"):Response.error()))));
  }else if(u.hostname==="fonts.googleapis.com"||u.hostname==="fonts.gstatic.com"){
    e.respondWith(caches.match(q).then(r=>r||fetch(q).then(r=>{if(r.ok||r.type==="opaque"){const c=r.clone();caches.open(CACHE).then(x=>x.put(q,c))}return r})));
  }
});
