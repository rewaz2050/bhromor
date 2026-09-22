/*
 * PROSANTI service worker — staff Web Push receiver ONLY.
 *
 * Deliberately NO fetch/cache handler: prices and stock are live, and a
 * cached shelf would be a stale one (see src/app/manifest.ts). Registered
 * exclusively from the admin panel, so storefront browsing never even
 * installs it.
 */

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "PROSANTI update", body: event.data ? event.data.text() : "" };
  }
  const title = typeof data.title === "string" && data.title ? data.title : "PROSANTI update";
  const options = {
    body: typeof data.body === "string" ? data.body : "",
    tag: typeof data.href === "string" ? data.href : "prosanti",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    data: { href: typeof data.href === "string" ? data.href : "/admin" },
    // Bangladesh market: taps happen long after arrival — keep it.
    requireInteraction: false,
    vibrate: [80, 40, 80],
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const href = (event.notification.data && event.notification.data.href) || "/admin";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      // Focus an existing panel window if one is open, else open a new one.
      const hit = clients.find((c) => new URL(c.url).pathname.startsWith("/admin"));
      if (hit) {
        hit.navigate?.(href).catch(() => hit.focus());
        return hit.focus();
      }
      return self.clients.openWindow(href);
    }),
  );
});
