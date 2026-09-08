/**
 * Admin sales reports — pure functions over the order store for the demo
 * Reports screen. Kept free of React/window so the math is unit-testable;
 * the Supabase phase swaps the order source, not these functions.
 *
 * Money stays integer paisa (§69). "Booked" revenue counts every live order
 * (not cancelled); "collected" counts only delivered orders — meaningful for
 * COD, where cash arrives at the doorstep (§20–21).
 */

import type { Order } from "./orders";
import type { Bdt } from "./format";

export interface ReportRange {
  /** null = all time (capped at 120 daily buckets for readability). */
  days: number | null;
  label: string;
}

export const REPORT_RANGES: readonly ReportRange[] = [
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: null, label: "All time" },
];

const DAY_MS = 86_400_000;
const MAX_DAILY_BUCKETS = 120;

export const startOfDay = (ms: number): number => {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

export const dayKey = (ms: number): string => {
  const d = new Date(ms);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
};

export const dayLabel = (ms: number): string =>
  new Date(ms).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });

export interface ReportSummary {
  /** live orders in the window (cancelled excluded). */
  orders: number;
  /** booked revenue — totals of live orders. */
  booked: Bdt;
  /** collected — totals of delivered orders only (COD reality). */
  collected: Bdt;
  /** cash still to arrive: booked minus collected. */
  outstanding: Bdt;
  averageOrder: Bdt;
  cancelled: number;
  cancelledPct: number;
  couponDiscount: Bdt;
}

export interface DaySales {
  key: string; // yyyy-mm-dd
  label: string; // "12 Sep"
  orderCount: number;
  revenue: Bdt;
}

export interface ProductRow {
  productId: string;
  name: string;
  units: number;
  orders: number;
  revenue: Bdt;
}

export interface ZoneRow {
  zoneName: string;
  orders: number;
  revenue: Bdt;
}

export interface CouponRow {
  code: string;
  orders: number;
  discount: Bdt;
}

export interface SalesReport {
  range: ReportRange;
  from: number; // inclusive, local midnight ms
  to: number; // exclusive-ish: end of today
  buckets: number;
  summary: ReportSummary;
  series: DaySales[];
  topProducts: ProductRow[];
  zones: ZoneRow[];
  coupons: CouponRow[];
}

const isLive = (o: Order) => o.status !== "cancelled";

export const salesReport = (
  orders: Order[],
  range: ReportRange,
): SalesReport => {
  const now = Date.now();
  const todayStart = startOfDay(now);
  let from: number;

  if (range.days === null) {
    const earliest =
      orders.length > 0
        ? Math.min(...orders.map((o) => o.createdAt))
        : todayStart;
    from = startOfDay(earliest);
    const span = Math.round((todayStart - from) / DAY_MS) + 1;
    if (span > MAX_DAILY_BUCKETS) {
      from = todayStart - (MAX_DAILY_BUCKETS - 1) * DAY_MS;
    }
  } else {
    from = todayStart - (range.days - 1) * DAY_MS;
  }
  const to = todayStart + DAY_MS; // exclusive upper bound

  const inWindow = (o: Order) => o.createdAt >= from && o.createdAt < to;
  const windowed = orders.filter(inWindow);
  const live = windowed.filter(isLive);

  const booked = live.reduce((sum, o) => sum + o.total, 0);
  const collected = live
    .filter((o) => o.status === "delivered")
    .reduce((sum, o) => sum + o.total, 0);
  const couponDiscount = live.reduce(
    (sum, o) => sum + (o.coupon?.discount ?? 0),
    0,
  );
  const cancelled = windowed.length - live.length;

  // Daily buckets — zero-fill every calendar day so charts look like charts.
  const series: DaySales[] = [];
  const buckets = Math.round((to - from) / DAY_MS);
  for (let i = 0; i < buckets; i++) {
    const dayStart = from + i * DAY_MS;
    const dayEnd = dayStart + DAY_MS;
    const rows = live.filter((o) => o.createdAt >= dayStart && o.createdAt < dayEnd);
    series.push({
      key: dayKey(dayStart),
      label: dayLabel(dayStart),
      orderCount: rows.length,
      revenue: rows.reduce((sum, o) => sum + o.total, 0),
    });
  }

  // Top products by revenue (snapshot name/sku at purchase time, §75).
  const byProduct = new Map<
    string,
    { name: string; units: number; orders: Set<string>; revenue: Bdt }
  >();
  for (const o of live) {
    for (const it of o.items) {
      const row = byProduct.get(it.productId) ?? {
        name: it.name,
        units: 0,
        orders: new Set<string>(),
        revenue: 0,
      };
      row.units += it.qty;
      row.orders.add(o.id);
      row.revenue += it.unitPrice * it.qty;
      byProduct.set(it.productId, row);
    }
  }
  const topProducts: ProductRow[] = [...byProduct.entries()]
    .map(([productId, r]) => ({
      productId,
      name: r.name,
      units: r.units,
      orders: r.orders.size,
      revenue: r.revenue,
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 8);

  // Delivery zones.
  const byZone = new Map<string, { orders: number; revenue: Bdt }>();
  for (const o of live) {
    const row = byZone.get(o.zoneName) ?? { orders: 0, revenue: 0 };
    row.orders += 1;
    row.revenue += o.total;
    byZone.set(o.zoneName, row);
  }
  const zones: ZoneRow[] = [...byZone.entries()]
    .map(([zoneName, z]) => ({ zoneName, ...z }))
    .sort((a, b) => b.revenue - a.revenue);

  // Coupon usage (§56).
  const byCoupon = new Map<string, { orders: number; discount: Bdt }>();
  for (const o of live) {
    if (!o.coupon) continue;
    const row = byCoupon.get(o.coupon.code) ?? { orders: 0, discount: 0 };
    row.orders += 1;
    row.discount += o.coupon.discount;
    byCoupon.set(o.coupon.code, row);
  }
  const coupons: CouponRow[] = [...byCoupon.entries()]
    .map(([code, c]) => ({ code, ...c }))
    .sort((a, b) => b.discount - a.discount);

  return {
    range,
    from,
    to,
    buckets: series.length,
    summary: {
      orders: live.length,
      booked,
      collected,
      outstanding: booked - collected,
      averageOrder: live.length > 0 ? Math.round(booked / live.length) : 0,
      cancelled,
      cancelledPct:
        windowed.length > 0
          ? Math.round((cancelled / windowed.length) * 100)
          : 0,
      couponDiscount,
    },
    series,
    topProducts,
    zones,
    coupons,
  };
};

/** Highest single-day revenue in a series (bar scaling). */
export const seriesMax = (series: DaySales[]): Bdt =>
  series.reduce((max, d) => Math.max(max, d.revenue), 0);
