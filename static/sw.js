// No caching (so a new version is never hidden behind an old one) - this worker exists to make the app
// installable and to show garden notifications, even when the app is closed.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (event) => event.respondWith(fetch(event.request)));

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = { title: "Grow to Gobble", body: event.data && event.data.text() }; }
  event.waitUntil(self.registration.showNotification(data.title || "Grow to Gobble", {
    body: data.body || "",
    icon: "/static/icons/icon-192.png",
    badge: "/static/icons/icon-192.png",
    data: { url: data.url || "/" },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
    for (const w of wins) { if ("focus" in w) { w.navigate(url); return w.focus(); } }
    return self.clients.openWindow(url);
  }));
});
