// 引っ越しにともない、前のアプリの Service Worker を解除して保存ファイルを消す
self.addEventListener("install",()=>self.skipWaiting());
self.addEventListener("activate",e=>e.waitUntil((async()=>{
  const ks=await caches.keys();await Promise.all(ks.filter(k=>k.startsWith("zubora-")).map(k=>caches.delete(k)));
  await self.registration.unregister();
  for(const c of await self.clients.matchAll({type:"window"}))c.navigate(c.url);
})()));
