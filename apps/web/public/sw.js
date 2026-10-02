// No authenticated responses or personal feed content are stored in a shared cache.
self.addEventListener("install", event => event.waitUntil(self.skipWaiting()));
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", event => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(fetch(event.request).catch(() => new Response(
    '<!doctype html><html lang="en"><meta name="viewport" content="width=device-width"><title>Distilled.news · Offline</title><body style="font-family:system-ui;background:#edf5f2;color:#173934;padding:32px"><h1>Distilled.news</h1><p>You are offline. Reconnect to load your briefings.</p><button onclick="location.reload()">Try again</button></body></html>',
    { headers: { "Content-Type": "text/html; charset=utf-8" } }
  )));
});
self.addEventListener("push", event => {
  let data = {};
  try { data = event.data?.json() || {}; } catch { /* Generic notification for invalid data. */ }
  event.waitUntil(self.registration.showNotification(data.title || "Distilled.news", {
    body: data.body || "A new briefing is ready.", icon: "/icon-192.png", badge: "/icon-192.png",
    tag: data.tag || "briefing", data: { url: data.url || "/" }
  }));
});
self.addEventListener("notificationclick", event => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/", self.location.origin);
  if (url.origin !== self.location.origin) return;
  event.waitUntil(self.clients.openWindow(url.href));
});
