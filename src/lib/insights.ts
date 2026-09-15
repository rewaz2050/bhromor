/**
 * Demand analytics (P2 #23 + #24) — pure math over real order rows.
 *
 * No forecasting theatre: these are counts of what actually happened
 * ("zone B buys panjabis on Fridays"), never invented trends, decay curves
 * or "AI insights". Cancelled orders never count — a cancelled order is a
 * plan nobody paid. Money is paisa end-to-end like everywhere else (§69).
 *
 * Both surfaces read through here so the vendor's own numbers and the
 * platform's zone view can never disagree about what a bucket means:
 *   • Vendor → dashboard "Insights"   (units by weekday, best hours, zones)
 *   • Admin  → reports  "Zone demand" (zone × weekday matrix + per-zone picks)
 *
 * Weekday/hour buckets use a fixed Asia/Dhaka offset (UTC+6, no DST — the
 * same rule promos.ts uses), so a server in Frankfurt and a phone in
 * Sunamganj count the SAME Friday.
 */

import { DHAKA_UTC_OFFSET_SECONDS } from "./promos";
import type { Order } from "./orders";

/** An order that actually demands stock: never a cancelled one. */
export const isDemand = (o: Order): boolean => o.status !== "cancelled";

export const dhakaHour = (ms: number): number => {
  const local = Math.floor(ms / 1000) + DHAKA_UTC_OFFSET_SECONDS;
  return Math.floor(((local % 86_400) + 86_400) % 86_400 / 3600);
};

/** 0 = Sunday … 6 = Saturday, Asia/Dhaka. */
export const dhakaWeekday = (ms: number): number => {
  const localDays = Math.floor((ms / 1000 + DHAKA_UTC_OFFSET_SECONDS) / 86_400);
  // The unix epoch (day 0) was a Thursday = Sunday-index 4 — offset, then wrap.
  return (((localDays + 4) % 7) + 7) % 7;
};

export const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

const unitsOf = (o: Order): number => o.items.reduce((s, it) => s + it.qty, 0);

export interface ProductUnits {
  productId: string;
  name: string;
  units: number;
  revenue: number;
}

/** Units per product across the given orders (cancelled excluded upstream). */
export const unitsByProduct = (orders: Order[]): ProductUnits[] => {
  const map = new Map<string, ProductUnits>();
  for (const o of orders) {
    if (!isDemand(o)) continue;
    for (const it of o.items) {
      const cur = map.get(it.productId) ?? {
        productId: it.productId,
        name: it.name,
        units: 0,
        revenue: 0,
      };
      cur.units += it.qty;
      cur.revenue += it.qty * it.unitPrice;
      map.set(it.productId, cur);
    }
  }
  return [...map.values()].sort(
    (a, b) => b.units - a.units || b.revenue - a.revenue || a.name.localeCompare(b.name),
  );
};

export interface WeekdayProfile {
  /** orders per weekday bucket, index = dhakaWeekday */
  orders: number[];
  units: number[];
  /** 0–6 with the most orders; null when nothing counts */
  busiest: number | null;
}

export const weekdayProfile = (orders: Order[]): WeekdayProfile => {
  const counts = new Array(7).fill(0);
  const units = new Array(7).fill(0);
  for (const o of orders) {
    if (!isDemand(o)) continue;
    const d = dhakaWeekday(o.createdAt);
    counts[d] += 1;
    units[d] += unitsOf(o);
  }
  let busiest: number | null = null;
  for (let i = 0; i < 7; i++) {
    if (counts[i] > 0 && (busiest === null || counts[i] > counts[busiest])) busiest = i;
  }
  return { orders: counts, units, busiest };
};

export interface HourProfile {
  orders: number[]; // index = hour 0–23 (Dhaka)
  best: { hour: number; orders: number } | null;
  /** Top two hours, for "most orders land 7–9PM"-style copy. */
  top: { hour: number; orders: number }[];
}

export const hourProfile = (orders: Order[]): HourProfile => {
  const counts = new Array(24).fill(0);
  for (const o of orders) {
    if (!isDemand(o)) continue;
    counts[dhakaHour(o.createdAt)] += 1;
  }
  const ranked = counts
    .map((n, hour) => ({ hour, orders: n }))
    .filter((x) => x.orders > 0)
    .sort((a, b) => b.orders - a.orders || a.hour - b.hour);
  return { orders: counts, best: ranked[0] ?? null, top: ranked.slice(0, 2) };
};

/* ------------------------------------------------------------------ */
/* #24 — zone-wise demand                                              */
/* ------------------------------------------------------------------ */

export interface ZoneDemandRow {
  zoneId: string;
  zoneName: string;
  orders: number;
  units: number;
  revenue: number;
  /** 0–1 share of counted orders — planning weights, not a forecast. */
  share: number;
  busiest: number | null; // weekday index
  /** Up to 3 pieces this zone buys more than anywhere else relative to its size. */
  topProducts: { name: string; units: number }[];
}

export const zoneDemand = (orders: Order[]): ZoneDemandRow[] => {
  interface Agg {
    zoneId: string;
    zoneName: string;
    orders: number;
    units: number;
    revenue: number;
    days: number[];
    products: Map<string, { name: string; units: number }>;
  }
  const zones = new Map<string, Agg>();
  let counted = 0;
  for (const o of orders) {
    if (!isDemand(o)) continue;
    counted += 1;
    const z =
      zones.get(o.zoneId) ??
      {
        zoneId: o.zoneId,
        zoneName: o.zoneName || o.zoneId,
        orders: 0,
        units: 0,
        revenue: 0,
        days: new Array(7).fill(0),
        products: new Map(),
      };
    z.orders += 1;
    z.units += unitsOf(o);
    z.revenue += o.subtotal;
    z.days[dhakaWeekday(o.createdAt)] += 1;
    for (const it of o.items) {
      const p = z.products.get(it.productId) ?? { name: it.name, units: 0 };
      p.units += it.qty;
      z.products.set(it.productId, p);
    }
    zones.set(o.zoneId, z);
  }
  return [...zones.values()]
    .map((z) => {
      let busiest: number | null = null;
      for (let i = 0; i < 7; i++) {
        if (z.days[i] > 0 && (busiest === null || z.days[i] > z.days[busiest])) busiest = i;
      }
      const topProducts = [...z.products.values()]
        .sort((a, b) => b.units - a.units || a.name.localeCompare(b.name))
        .slice(0, 3);
      return {
        zoneId: z.zoneId,
        zoneName: z.zoneName,
        orders: z.orders,
        units: z.units,
        revenue: z.revenue,
        share: counted === 0 ? 0 : z.orders / counted,
        busiest,
        topProducts,
      };
    })
    .sort((a, b) => b.orders - a.orders || a.zoneName.localeCompare(b.zoneName));
};

/** Human hour like "7PM" for a 24h index — copy for cards, not math. */
export const hourLabel = (hour: number): string => {
  const h = ((hour % 24) + 24) % 24;
  if (h === 0) return "12AM";
  if (h === 12) return "noon";
  return h > 12 ? `${h - 12}PM` : `${h}AM`;
};
