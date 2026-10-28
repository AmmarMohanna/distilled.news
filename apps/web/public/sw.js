// No authenticated responses or personal feed content are stored in a shared cache.
self.addEventListener("install", event => event.waitUntil(self.skipWaiting()));
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", event => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(fetch(event.request).catch(() => {
    const languages={"en":{"title":"You're offline","body":"Reconnect to load your briefings.","retry":"Try again"},"fr":{"title":"Vous êtes hors ligne","body":"Reconnectez-vous pour charger vos résumés.","retry":"Réessayer"},"ar":{"title":"أنت غير متصل بالإنترنت","body":"أعد الاتصال لتحميل موجزاتك.","retry":"حاول مجددًا"}};
    const requested=(event.request.headers.get('Accept-Language')||'en').split(',')[0].split('-')[0];
    const lang=languages[requested]?requested:'en',copy=languages[lang];
    return new Response(`<!doctype html><html lang="${lang}" dir="${lang==='ar'?'rtl':'ltr'}"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Distilled.News — ${copy.title}</title>
<style>*{box-sizing:border-box}body{margin:0;min-height:100svh;padding:24px;display:grid;place-items:center;background:#fff;color:#202124;font:16px/1.5 system-ui,-apple-system,sans-serif}main{text-align:center;max-width:420px}.offline-wifi{width:80px;height:80px;color:#5e5ce6;margin-bottom:28px}h1{font-size:clamp(26px,6vw,34px);line-height:1.2;margin:0 0 12px}p{color:#61636b;margin:0}button{min-height:44px;margin-top:24px;padding:12px 28px;border:0;border-radius:999px;background:#5e5ce6;color:white;font:inherit;cursor:pointer}button:focus-visible{outline:3px solid #8785f0;outline-offset:4px}</style>
<main><svg class="offline-wifi" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m2 2 20 20M8.5 16.5a5 5 0 0 1 7 0M5 12.5a10 10 0 0 1 5-2.3M14 10.2a10 10 0 0 1 5 2.3M2 8.5a16 16 0 0 1 5-2.8M10.5 5a16 16 0 0 1 11.5 3.5"/><circle cx="12" cy="20" r=".8" fill="currentColor" stroke="none"/></svg><h1>${copy.title}</h1><p>${copy.body}</p><button onclick="location.reload()">${copy.retry}</button></main></html>`,{headers:{'Content-Type':'text/html; charset=utf-8'}});
  }));
});
self.addEventListener("push", event => {
  let data = {};
  try { data = event.data?.json() || {}; } catch { /* Generic notification for invalid data. */ }
  event.waitUntil(self.registration.showNotification(data.title || "Distilled.News", {
    body: data.body || "A new briefing is ready.", icon: "/notification-icon.png?v=transparent-1", badge: "/notification-badge.png?v=transparent-1",
    tag: data.tag || "briefing", data: { url: data.url || "/" }
  }));
});
self.addEventListener("notificationclick", event => {
  event.notification.close();
  let url;
  try { url=new URL(event.notification.data?.url||'/',self.location.origin); } catch { return; }
  if (url.origin!==self.location.origin) return;
  event.waitUntil((async()=>{
    const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    const existing=windows.find(client=>client.url===url.href) || windows.find(client=>new URL(client.url).origin===self.location.origin);
    if(existing){if(existing.url!==url.href)await existing.navigate(url.href);await existing.focus();return;}
    await self.clients.openWindow(url.href);
  })());
});
