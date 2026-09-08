/**
 * Notifications (§35) — demo, browser-local.
 *
 * Seeds mirror live events (new orders, status moves, reviews awaiting
 * approval, low stock); the page also computes a live “needs attention”
 * summary straight from the order/catalog/review stores so it never
 * drifts from the actual admin data.
 */

export const NOTIFS_STORAGE_KEY = "prosanti.notifications.v1";

export type NotifKind = "order" | "review" | "stock" | "system";

export interface Notif {
  id: string;
  kind: NotifKind;
  title: string;
  body: string;
  at: number;
  read: boolean;
  href?: string;
}

export const KIND_LABEL: Record<NotifKind, string> = {
  order: "Order",
  review: "Review",
  stock: "Stock",
  system: "System",
};

export const unreadCountOf = (list: Notif[]): number =>
  list.filter((n) => !n.read).length;

export const markAllRead = (list: Notif[]): Notif[] =>
  list.map((n) => ({ ...n, read: true }));

export const markRead = (list: Notif[], id: string): Notif[] =>
  list.map((n) => (n.id === id ? { ...n, read: true } : n));

/** “just now / 4m ago / 2h ago / 3d ago / 8 Sep”. */
export const agoLabel = (ms: number, now: number = Date.now()): string => {
  const diff = Math.max(0, now - ms);
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(ms).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
};
