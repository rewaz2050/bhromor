/*
 * PROSANTI service worker — staff Web Push receiver ONLY.
 *
 * Deliberately NO fetch/cache handler: prices and stock are live, and a
 * cached shelf would be a stale one (see src/app/manifest.ts). Registered
 * exclusively from the admin panel, so storefront browsing never even
 * installs it.
 *
 * Repair path for a lost subscription: this worker does NOT try to be clever
 * on its own (`pushsubscriptionchange` effectively never fires in Chrome,
 * and a worker has no staff session to re-save an endpoint with — the
 * subscription table is service-role only). Instead the panel re-saves the
 * current endpoint every time the setup card is opened with permission
 * already granted (see src/components/admin/push-setup.tsx).
 */

// A new worker takes over on the next load instead of waiting for every
// panel tab to close — an updated handler otherwise sits idle for weeks on
// the owner's phone.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

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
  const href = safeHref(event.notification.data && event.notification.data.href);
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      // Focus an existing window on the same surface (the panel for staff
      // pushes, the tracker for a shopper's order updates), else open one.
      const target = href.split("?")[0];
      const hit = clients.find((c) => {
        try {
          return new URL(c.url).pathname.startsWith(target);
        } catch {
          return false;
        }
      });
      if (hit) {
        hit.navigate?.(href).catch(() => hit.focus());
        return hit.focus();
      }
      return self.clients.openWindow(href);
    }),
  );
});

/**
 * Only same-origin paths are ever navigated to. Payloads come from our own
 * server, but a push payload is data like any other — an absolute URL or a
 * protocol-relative "//evil.example" must never become a redirect.
 */
function safeHref(value) {
  const fallback = "/track";
  if (typeof value !== "string" || value.trim() === "") return fallback;
  const href = value.trim();
  if (!href.startsWith("/") || href.startsWith("//")) return fallback;
  return href;
}
