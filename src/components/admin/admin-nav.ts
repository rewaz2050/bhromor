/**
 * Admin navigation — grouped, searchable (ops pass 2026-10-06).
 *
 * The admin shell used to carry one flat list of 26 links: the sidebar was a
 * wall, and reaching anything meant scanning all of it every time. This
 * module is the single source for that navigation so three consumers can
 * share it — the grouped sidebar, the ⌘K command palette, and the page
 * title — without any of them keeping its own copy of the routes.
 *
 * Pure data + pure helpers (unit-tested). No JSX, no hooks.
 */

import type { ComponentType } from "react";
import {
  IconBanknote,
  IconBell,
  IconBolt,
  IconBox,
  IconCard,
  IconChart,
  IconChat,
  IconFlag,
  IconGift,
  IconGrid,
  IconHome,
  IconImage,
  IconLeaf,
  IconMail,
  IconMapPin,
  IconReset,
  IconSettings,
  IconShield,
  IconStore,
  IconTag,
  IconTruck,
  IconUser,
  IconVideo,
} from "@/components/ui/icons";

export type AdminIcon = ComponentType<{ className?: string }>;

/** Which human queue a nav badge counts (apply = sign up, 2026-09-26). */
export type AdminQueue = "shops" | "riders" | "resets";

export interface AdminNavItem {
  href: string;
  label: string;
  icon: AdminIcon;
  /** True when this item owns the route (drives the active state). */
  match: (pathname: string) => boolean;
  /** Words staff actually type — "sale", "bKash", "coverage" — not labels. */
  keywords?: string[];
  queue?: AdminQueue;
}

export interface AdminNavGroup {
  id: string;
  label: string;
  items: AdminNavItem[];
}

/** A nav item flattened out of its group (what the palette searches). */
export interface AdminNavEntry extends AdminNavItem {
  groupId: string;
  groupLabel: string;
}

const exact =
  (href: string) =>
  (pathname: string): boolean =>
    pathname === href;

/** Owns the page *and* everything below it (detail pages, sub-queues). */
const tree =
  (href: string) =>
  (pathname: string): boolean =>
    pathname === href || pathname.startsWith(`${href}/`);

export const ADMIN_NAV_GROUPS: readonly AdminNavGroup[] = [
  {
    id: "ops",
    label: "Ops",
    items: [
      { href: "/admin", label: "Dashboard", icon: IconGrid, match: exact("/admin") },
      {
        href: "/admin/orders",
        label: "Orders",
        icon: IconBox,
        match: tree("/admin/orders"),
        keywords: ["sale", "parcel", "cancel", "refund", "history"],
      },
      {
        href: "/admin/deliveries",
        label: "Deliveries",
        icon: IconTruck,
        match: tree("/admin/deliveries"),
        keywords: ["dispatch", "assign", "pickup", "courier", "trip"],
      },
      {
        href: "/admin/live",
        label: "Live",
        icon: IconVideo,
        match: tree("/admin/live"),
        keywords: ["stream", "session", "video", "show"],
      },
    ],
  },
  {
    id: "catalog",
    label: "Catalog",
    items: [
      {
        href: "/admin/products",
        label: "Products",
        icon: IconTag,
        match: tree("/admin/products"),
        keywords: ["catalogue", "sku", "price", "new", "edit"],
      },
      {
        href: "/admin/categories",
        label: "Categories",
        icon: IconGrid,
        match: tree("/admin/categories"),
        keywords: ["collection", "taxonomy", "menu"],
      },
      {
        href: "/admin/inventory",
        label: "Inventory",
        icon: IconStore,
        match: tree("/admin/inventory"),
        keywords: ["stock", "low stock", "variant", "size", "restock"],
      },
      {
        href: "/admin/media",
        label: "Media",
        icon: IconImage,
        match: exact("/admin/media"),
        keywords: ["image", "photo", "upload", "cloudinary"],
      },
      {
        href: "/admin/homepage",
        label: "Homepage",
        icon: IconLeaf,
        match: exact("/admin/homepage"),
        keywords: ["cms", "banner", "hero", "sections", "shelf"],
      },
    ],
  },
  {
    id: "people",
    label: "People",
    items: [
      {
        href: "/admin/shops",
        label: "Shops",
        icon: IconHome,
        match: exact("/admin/shops"),
        keywords: ["vendor", "seller", "application", "approve", "dossier"],
        queue: "shops",
      },
      {
        href: "/admin/riders",
        label: "Riders",
        icon: IconTruck,
        match: tree("/admin/riders"),
        keywords: ["courier", "application", "approve", "kyc", "scorecard"],
        queue: "riders",
      },
      {
        href: "/admin/staff",
        label: "Staff",
        icon: IconShield,
        match: exact("/admin/staff"),
        keywords: ["admin user", "role", "permission", "login"],
      },
      {
        href: "/admin/customers",
        label: "Customers",
        icon: IconUser,
        match: exact("/admin/customers"),
        keywords: ["buyer", "shopper", "account", "phone"],
      },
      {
        href: "/admin/access",
        label: "Access requests",
        icon: IconReset,
        match: exact("/admin/access"),
        keywords: ["password", "reset", "login", "sign in"],
        queue: "resets",
      },
    ],
  },
  {
    id: "money",
    label: "Money",
    items: [
      {
        href: "/admin/money",
        label: "Money",
        icon: IconCard,
        match: tree("/admin/money"),
        keywords: ["cash", "ledger", "settlement", "remit", "audit", "export"],
      },
      {
        href: "/admin/payouts",
        label: "Payouts",
        icon: IconBanknote,
        match: exact("/admin/payouts"),
        keywords: ["rider pay", "withdraw", "settle", "earnings"],
      },
      {
        href: "/admin/payments",
        label: "Payments",
        icon: IconCard,
        match: exact("/admin/payments"),
        keywords: ["bkash", "nagad", "wallet", "trxid", "verify"],
      },
      {
        href: "/admin/coupons",
        label: "Coupons",
        icon: IconGift,
        match: exact("/admin/coupons"),
        keywords: ["discount", "promo", "code", "voucher"],
      },
    ],
  },
  {
    id: "reach",
    label: "Reach",
    items: [
      {
        href: "/admin/notifications",
        label: "Notifications",
        icon: IconBell,
        match: tree("/admin/notifications"),
        keywords: ["alert", "push", "broadcast"],
      },
      {
        href: "/admin/newsletter",
        label: "Newsletter",
        icon: IconMail,
        match: exact("/admin/newsletter"),
        keywords: ["email", "subscriber", "campaign"],
      },
      {
        href: "/admin/messages",
        label: "Messages",
        icon: IconChat,
        match: exact("/admin/messages"),
        keywords: ["contact", "inbox", "support", "whatsapp"],
      },
      {
        href: "/admin/reviews",
        label: "Reviews",
        icon: IconFlag,
        match: exact("/admin/reviews"),
        keywords: ["moderation", "rating", "stamp", "approve"],
      },
    ],
  },
  {
    id: "insight",
    label: "Insight & setup",
    items: [
      {
        href: "/admin/reports",
        label: "Reports",
        icon: IconChart,
        match: exact("/admin/reports"),
        keywords: ["funnel", "analytics", "kpi", "conversion"],
      },
      {
        href: "/admin/growth",
        label: "Growth",
        icon: IconBolt,
        match: tree("/admin/growth"),
        keywords: ["campaign", "flash", "referral", "loyalty", "teaser"],
      },
      {
        href: "/admin/zones",
        label: "Delivery zones",
        icon: IconMapPin,
        match: exact("/admin/zones"),
        keywords: ["area", "coverage", "charge", "thana", "neighbourhood"],
      },
      {
        href: "/admin/settings",
        label: "Settings",
        icon: IconSettings,
        match: exact("/admin/settings"),
        keywords: ["config", "hours", "ops", "contact"],
      },
    ],
  },
];

export const ADMIN_NAV_ITEMS: readonly AdminNavEntry[] = ADMIN_NAV_GROUPS.flatMap(
  (group) =>
    group.items.map((item) => ({
      ...item,
      groupId: group.id,
      groupLabel: group.label,
    })),
);

const TITLES: readonly (readonly [RegExp, string])[] = [
  [/^\/admin\/orders\/.+/, "Order details"],
  [/^\/admin\/orders$/, "Orders"],
  [/^\/admin\/reports$/, "Reports"],
  [/^\/admin\/growth$/, "Growth"],
  [/^\/admin\/products\/(new|[^/]+)$/, "Product editor"],
  [/^\/admin\/products$/, "Products"],
  [/^\/admin\/categories$/, "Categories"],
  [/^\/admin\/zones$/, "Delivery zones"],
  [/^\/admin\/homepage$/, "Homepage"],
  [/^\/admin\/customers$/, "Customers"],
  [/^\/admin\/shops$/, "Shops"],
  [/^\/admin\/money$/, "Money"],
  [/^\/admin\/payouts$/, "Payouts"],
  [/^\/admin\/riders$/, "Riders"],
  [/^\/admin\/access$/, "Access requests"],
  [/^\/admin\/deliveries$/, "Deliveries"],
  [/^\/admin\/reviews$/, "Reviews"],
  [/^\/admin\/coupons$/, "Coupons"],
  [/^\/admin\/inventory$/, "Inventory"],
  [/^\/admin\/media$/, "Media"],
  [/^\/admin\/notifications$/, "Notifications"],
  [/^\/admin\/payments$/, "Payments"],
  [/^\/admin\/live$/, "Live shopping"],
  [/^\/admin\/settings$/, "Settings"],
  [/^\/admin\/staff$/, "Staff"],
  [/^\/admin$/, "Dashboard"],
];

/** Header title for the current route (detail pages included). */
export const adminTitleFor = (pathname: string): string =>
  TITLES.find(([re]) => re.test(pathname))?.[1] ?? "Admin";

export const activeAdminNavItem = (pathname: string): AdminNavEntry | undefined =>
  ADMIN_NAV_ITEMS.find((item) => item.match(pathname));

/** Pending applications / reset requests, per nav item (0 when none). */
export const pendingFor = (
  item: Pick<AdminNavItem, "queue">,
  counts: Partial<Record<AdminQueue, number>>,
): number => (item.queue ? counts[item.queue] ?? 0 : 0);

export const pendingNoun = (queue: AdminQueue): string =>
  queue === "resets" ? "request" : "application";

/* ------------------------------------------------------------------ */
/* Storage helpers — SSR-safe, and never throw on a locked-down browser */
/* ------------------------------------------------------------------ */

const RECENTS_KEY = "admin.recent-nav.v1";
const COLLAPSED_KEY = "admin.nav-groups.v1";
export const RECENTS_MAX = 6;

const readJson = <T,>(key: string, fallback: T): T => {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T) : fallback;
  } catch {
    return fallback;
  }
};

const writeJson = (key: string, value: string[]): void => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode / quota — recents are a convenience, not state.
  }
};

const knownHrefs = (): Set<string> =>
  new Set(ADMIN_NAV_ITEMS.map((item) => item.href));

/**
 * Recently visited admin pages, newest first. Stale hrefs (a route that no
 * longer exists) drop out on read, so a rename never leaves a dead link.
 *
 * The value is cached module-side (and cleared on every write) because
 * `useSyncExternalStore` compares snapshots by identity: a fresh array on
 * every call would re-render forever.
 */
let recentsCache: string[] | null = null;
const EMPTY: readonly string[] = [];

export const readRecentAdminNav = (): readonly string[] => {
  if (recentsCache) return recentsCache;
  const known = knownHrefs();
  recentsCache = readJson<string[]>(RECENTS_KEY, []).filter(
    (href): href is string => typeof href === "string" && known.has(href),
  );
  return recentsCache;
};

/** Notified when the recents list changes (a page visit). */
const recentsListeners = new Set<() => void>();

export const subscribeRecentAdminNav = (listener: () => void): (() => void) => {
  recentsListeners.add(listener);
  return () => {
    recentsListeners.delete(listener);
  };
};

/** Server snapshot — the palette only ever opens after a user gesture. */
export const recentAdminNavServerSnapshot = (): readonly string[] => EMPTY;

export const pushRecentAdminNav = (href: string): void => {
  const next = [href, ...readRecentAdminNav().filter((h) => h !== href)].slice(
    0,
    RECENTS_MAX,
  );
  recentsCache = next;
  writeJson(RECENTS_KEY, next);
  recentsListeners.forEach((listener) => listener());
};

/* ------------------------------------------------------------------ */
/* Group fold state — same store pattern as recents (identity-stable)  */
/* ------------------------------------------------------------------ */

let collapsedCache: readonly string[] | null = null;
const NO_IDS: readonly string[] = [];

/** Groups staff folded away in the sidebar (ids). */
export const readCollapsedGroups = (): readonly string[] => {
  if (collapsedCache) return collapsedCache;
  const known = new Set(ADMIN_NAV_GROUPS.map((group) => group.id));
  collapsedCache = readJson<string[]>(COLLAPSED_KEY, []).filter(
    (id): id is string => typeof id === "string" && known.has(id),
  );
  return collapsedCache;
};

const collapsedListeners = new Set<() => void>();

export const subscribeNavGroups = (listener: () => void): (() => void) => {
  collapsedListeners.add(listener);
  return () => {
    collapsedListeners.delete(listener);
  };
};

/** Server snapshot — every group starts open, so there is nothing to fold. */
export const navGroupsServerSnapshot = (): readonly string[] => NO_IDS;

export const writeCollapsedGroups = (ids: string[]): void => {
  // Sanitised on the way in, so the cache and storage can never disagree.
  const known = new Set(ADMIN_NAV_GROUPS.map((group) => group.id));
  const next = [...new Set(ids)].filter((id) => known.has(id));
  collapsedCache = next;
  writeJson(COLLAPSED_KEY, next);
  collapsedListeners.forEach((listener) => listener());
};

/**
 * Test seam: drop the two module caches. They mirror localStorage, which a
 * test clears between cases — without this the stale mirror would win.
 */
export const __resetAdminNavCache = (): void => {
  recentsCache = null;
  collapsedCache = null;
};

/* ------------------------------------------------------------------ */
/* Search                                                             */
/* ------------------------------------------------------------------ */

export interface AdminNavHit {
  item: AdminNavEntry;
  /** Lower is better: 0 exact label → 6 path fragment. */
  score: number;
}

const norm = (value: string): string => value.toLowerCase().trim();

/**
 * Ranked, forgiving search over the nav: label first, then the words staff
 * type, then the group, then the URL fragment. Substring, not prefix-only —
 * "pyt" should still find Payouts.
 */
export function searchAdminNav(query: string, limit = 12): AdminNavHit[] {
  const q = norm(query);
  if (!q) return [];
  const slug = q.replace(/\s+/g, "-");
  const hits: AdminNavHit[] = [];

  for (const item of ADMIN_NAV_ITEMS) {
    const label = norm(item.label);
    const words = label.split(/\s+/);
    let score = -1;

    if (label === q) score = 0;
    else if (label.startsWith(q)) score = 1;
    else if (words.some((word) => word.startsWith(q))) score = 2;
    else if (label.includes(q)) score = 3;
    else if ((item.keywords ?? []).some((k) => norm(k).includes(q))) score = 4;
    else if (norm(item.groupLabel).startsWith(q)) score = 5;
    else if (slug && item.href.slice("/admin".length).includes(slug)) score = 6;

    if (score >= 0) hits.push({ item, score });
  }

  // Stable sort: equal scores keep the sidebar's own order.
  hits.sort((a, b) => a.score - b.score);
  return limit > 0 ? hits.slice(0, limit) : hits;
}
