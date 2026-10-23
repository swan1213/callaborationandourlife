// TailorBid service worker: shows web push notifications (src/lib/push.ts) as desktop notifications, even when
// no TailorBid tab is open, and opens the right page when one is clicked.

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: event.data ? event.data.text() : "TailorBid" };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "TailorBid", {
      body: data.body || "",
      icon: "/icon.svg",
      badge: "/icon.svg",
      tag: data.tag || undefined,
      data: { url: data.url || "/notifications" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/notifications", self.location.origin).href;
  event.waitUntil(
    (async () => {
      // Reuse an open TailorBid tab when there is one.
      const tabs = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const tab = tabs.find((c) => new URL(c.url).origin === self.location.origin);
      if (tab) {
        await tab.focus();
        return tab.navigate(url).catch(() => self.clients.openWindow(url));
      }
      return self.clients.openWindow(url);
    })()
  );
});

// A new version takes over right away.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
