/**
 * Notifications (§35) — types and pure helpers.
 *
 * Live notifications arrive from the database (see use-notifications.ts and
 * /api/admin/notifications); these helpers render and count them.
 */

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

/* ------------------------------------------------------------------ */
/* Inbox shaping (2026-09-18) — pure, so the page only renders          */
/* ------------------------------------------------------------------ */

export type InboxFilter = NotifKind | "all" | "unread";

/** Count per filter chip, computed once per list. */
export const inboxCounts = (list: readonly Notif[]): Record<InboxFilter, number> => {
  const out: Record<InboxFilter, number> = {
    all: list.length,
    unread: 0,
    order: 0,
    review: 0,
    stock: 0,
    system: 0,
  };
  for (const n of list) {
    out[n.kind] += 1;
    if (!n.read) out.unread += 1;
  }
  return out;
};

export const applyInboxFilter = (
  list: readonly Notif[],
  filter: InboxFilter,
): Notif[] =>
  list.filter((n) =>
    filter === "all" ? true : filter === "unread" ? !n.read : n.kind === filter,
  );

/**
 * Newest first, then split into "Today / Yesterday / Earlier" so a busy
 * morning's forty notices do not read as one undated wall.
 */
export interface InboxGroup {
  label: "Today" | "Yesterday" | "Earlier";
  items: Notif[];
}

const startOfLocalDay = (ms: number): number => {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

export const groupByDay = (
  list: readonly Notif[],
  now: number = Date.now(),
): InboxGroup[] => {
  const today = startOfLocalDay(now);
  const yesterday = today - 86_400_000;
  const sorted = [...list].sort((a, b) => b.at - a.at);
  const groups: InboxGroup[] = [
    { label: "Today", items: [] },
    { label: "Yesterday", items: [] },
    { label: "Earlier", items: [] },
  ];
  for (const n of sorted) {
    if (n.at >= today) groups[0].items.push(n);
    else if (n.at >= yesterday) groups[1].items.push(n);
    else groups[2].items.push(n);
  }
  return groups.filter((g) => g.items.length > 0);
};

/**
 * Where a notice should send the operator. Older rows were written with
 * the order ROW uuid in `href` (the detail page reads by order number and
 * 404s); an order number in the title lets us repair the link on render.
 */
const ORDER_NO_RE = /\bPS-\d{8}-\d{4}\b/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const inboxHref = (n: Pick<Notif, "href" | "title" | "body">): string | undefined => {
  if (!n.href) return undefined;
  const m = n.href.match(/^\/admin\/orders\/([^/?#]+)$/);
  if (!m) return n.href;
  const target = decodeURIComponent(m[1]);
  if (!UUID_RE.test(target)) return n.href;
  const no = n.title.match(ORDER_NO_RE)?.[0] ?? n.body.match(ORDER_NO_RE)?.[0];
  return no ? `/admin/orders/${no}` : "/admin/orders";
};
