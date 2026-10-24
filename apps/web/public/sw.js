// No authenticated responses or personal feed content are stored in a shared cache.
self.addEventListener("install", event => event.waitUntil(self.skipWaiting()));
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", event => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(fetch(event.request).catch(() => new Response(
    `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#f8f9ff">
<title>Distilled.news ? Offline</title>
<style>
*{box-sizing:border-box}
html{min-height:100%;background:#f8f9ff}
body{margin:0;min-height:100vh;min-height:100svh;display:grid;place-items:center;padding:32px 20px;color:#1c202c;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:radial-gradient(ellipse at 50% 42%,#f1efff66,transparent 58%),#f8f9ff}
main{text-align:center;width:100%;max-width:440px}
.art{position:relative;width:300px;height:172px;margin:0 auto 28px;isolation:isolate;display:grid;justify-items:center;align-items:start;padding-top:32px}
.cloud{position:absolute;background:linear-gradient(145deg,#e6e2ff,#f2f0ff);border-radius:40px;z-index:-1}
.cloud:before,.cloud:after{content:"";position:absolute;border-radius:50%;background:inherit}
.cloud-left{width:108px;height:38px;top:26px;left:13px}
.cloud-left:before{width:61px;height:61px;left:23px;bottom:3px}
.cloud-left:after{width:44px;height:44px;right:4px;bottom:0}
.cloud-right{width:79px;height:28px;right:0;bottom:27px;opacity:.7}
.cloud-right:before{width:44px;height:44px;left:17px;bottom:3px}
.tile{position:relative;width:154px;height:128px;border-radius:30px;border:1px solid #ffffff;background:linear-gradient(145deg,#ffffffb8,#ffffff73);box-shadow:0 18px 35px #7764e30d;display:grid;place-items:center}
.signal{width:104px;height:90px}
h1{font-size:36px;line-height:1.2;letter-spacing:-1.3px;margin:0 0 8px;font-weight:750}
p{margin:0;color:#808393;font-size:16px;line-height:1.6}
button{margin-top:24px;min-width:162px;min-height:46px;padding:12px 26px;border:0;border-radius:28px;background:linear-gradient(135deg,#6955f5,#5149ef);box-shadow:0 7px 16px #6554f51a;color:white;display:inline-flex;justify-content:center;align-items:center;gap:10px;font-family:inherit;font-size:14px;font-weight:500;line-height:1.4;cursor:pointer}
button:hover{background:#5144e5}
button:focus-visible{outline:3px solid #aaa0ff;outline-offset:5px}
button svg{width:18px;height:18px}
.hint{margin-top:26px;display:flex;justify-content:center;align-items:center;gap:8px;font-size:12px}
.hint svg{width:18px;height:18px;flex-shrink:0}
@media(max-width:360px){h1{font-size:30px}.art{width:280px}p{font-size:14px}}
</style>
</head>
<body>
<main aria-labelledby="offline-title">
<div class="art" aria-hidden="true">
<div class="cloud cloud-left"></div><div class="cloud cloud-right"></div>
<div class="tile">
<svg class="signal" viewBox="0 0 104 90" fill="none">
<path d="M14 34C34 13 66 13 89 34M30 49C42 36 61 36 74 49" stroke="#dedaff" stroke-width="9" stroke-linecap="round"/>
<circle cx="52" cy="68" r="9" fill="#d2ccff"/>
<circle cx="84" cy="66" r="14" fill="#6655ef"/>
<path d="m80 62 8 8m0-8-8 8" stroke="white" stroke-width="2" stroke-linecap="round"/>
</svg>
</div>
</div>
<h1 id="offline-title">You're Offline</h1>
<p>Reconnect to load your briefings.</p>
<button type="button" onclick="location.reload()">
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 7v5h-5M20 12a8 8 0 1 0-2 6M20 7v5"/></svg>
Try Again
</button>
<p class="hint"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><path d="M2 8a16 16 0 0 1 20 0M5 12a11 11 0 0 1 14 0M8.5 16a5.5 5.5 0 0 1 7 0"/><circle cx="12" cy="20" r="1" fill="currentColor" stroke="none"/></svg>Check your connection and refresh.</p>
</main>
</body>
</html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } }
  )));
});
self.addEventListener("push", event => {
  let data = {};
  try { data = event.data?.json() || {}; } catch { /* Generic notification for invalid data. */ }
  event.waitUntil(self.registration.showNotification(data.title || "Distilled.News", {
    body: data.body || "A new briefing is ready.", icon: "/icon-192.png?v=brand-4", badge: "/icon-192.png?v=brand-4",
    tag: data.tag || "briefing", data: { url: data.url || "/" }
  }));
});
self.addEventListener("notificationclick", event => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/", self.location.origin);
  if (url.origin !== self.location.origin) return;
  event.waitUntil(self.clients.openWindow(url.href));
});
