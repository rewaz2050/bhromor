/*
 * PROSANTI service worker — Web Push receiver ONLY (staff panel + rider app).
 *
 * Deliberately NO fetch/cache handler: prices and stock are live, and a
 * cached shelf would be a stale one (see src/app/manifest.ts). Registered
 * only from the admin panel and the rider app, so storefront browsing never
 * even installs it.
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
  const href = typeof data.href === "string" ? data.href : "/admin";
  // Rider pushes (item I) are time-critical offers: `urgent` keeps the card on
  // screen with the long vibration, `renotify` re-alerts when a second offer
  // replaces the first under the same tag.
  const urgent = data.urgent === true;
  const options = {
    body: typeof data.body === "string" ? data.body : "",
    tag: typeof data.tag === "string" && data.tag ? data.tag : href || "prosanti",
    renotify: data.renotify === true,
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    data: { href },
    // Bangladesh market: taps happen long after arrival — keep it.
    requireInteraction: urgent,
    vibrate: urgent ? [220, 110, 220, 110, 400] : [80, 40, 80],
  };
  const show = () => self.registration.showNotification(title, options);
  if (data.skipIfFocused === true) {
    // The rider is already looking at the app (it has its own alert) — a
    // second banner on top of it is noise. Chrome allows skipping the
    // notification only while a window of the site is visible.
    event.waitUntil(
      self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
        const target = href.split("?")[0];
        const watching = clients.some((c) => {
          try {
            return c.visibilityState === "visible" && new URL(c.url).pathname.startsWith(target);
          } catch {
            return false;
          }
        });
        return watching ? undefined : show();
      }),
    );
    return;
  }
  event.waitUntil(show());
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
