/**
 * Vendor dashboard maths (2026-09-27, Phase 2) — pure helpers, pure tests.
 */
import { describe, expect, it } from "vitest";
import type { Order } from "../orders";
import {
  LATE_ORDER_MS,
  isLateOrder,
  newOrderIds,
  shopPath,
  splitNeedsAction,
  todayStats,
} from "../vendor-dashboard";

const NOW = Date.parse("2026-09-27T18:00:00+06:00");

const order = (over: Partial<Order> = {}): Order =>
  ({
    id: over.id ?? "PS-1",
    createdAt: over.createdAt ?? NOW - 60_000,
    customer: { name: "Rima", phone: "01712345678" },
    zoneId: "dhaka",
    zoneName: "Dhaka",
    etaLabel: "30 min",
    items: [{ productId: "p1", name: "Panjabi", qty: 1, price: 120000 }],
    subtotal: 120000,
    deliveryCharge: 6000,
    total: over.total ?? 126000,
    payment: "cod",
    status: over.status ?? "pending",
    timeline: [],
    ...over,
  }) as Order;

describe("splitNeedsAction", () => {
  it("separates to-confirm, preparing and rider-ready work", () => {
    const buckets = splitNeedsAction(
      [
        order({ id: "PS-1", status: "pending" }),
        order({ id: "PS-2", status: "confirmed" }),
        order({ id: "PS-3", status: "preparing" }),
        order({ id: "PS-4", status: "ready-for-pickup" }),
        order({ id: "PS-5", status: "delivered" }),
      ],
      NOW,
    );
    expect(buckets.fresh.map((o) => o.id)).toEqual(["PS-1"]);
    expect(buckets.preparing.map((o) => o.id)).toEqual(["PS-3"]);
    expect(buckets.readyForRider.map((o) => o.id)).toEqual(["PS-4"]);
  });

  it("calls out the orders nobody has answered in ten minutes, oldest first", () => {
    const buckets = splitNeedsAction(
      [
        order({ id: "PS-2", status: "confirmed", createdAt: NOW - 25 * 60_000 }),
        order({ id: "PS-1", status: "pending", createdAt: NOW - 40 * 60_000 }),
        order({ id: "PS-3", status: "pending", createdAt: NOW - 60_000 }),
        order({ id: "PS-4", status: "preparing", createdAt: NOW - 90 * 60_000 }),
      ],
      NOW,
    );
    expect(buckets.late.map((o) => o.id)).toEqual(["PS-1", "PS-2"]);
    expect(isLateOrder(order({ createdAt: NOW - LATE_ORDER_MS - 1 }), NOW)).toBe(true);
    expect(isLateOrder(order({ createdAt: NOW - LATE_ORDER_MS }), NOW)).toBe(false);
  });
});

describe("todayStats", () => {
  it("counts only today and never the cancellations", () => {
    const stats = todayStats(
      [
        order({ id: "PS-1", total: 100000, createdAt: NOW - 3 * 60 * 60_000 }),
        order({ id: "PS-2", total: 50000, createdAt: NOW - 60_000 }),
        order({ id: "PS-3", total: 900000, status: "cancelled", createdAt: NOW - 60_000 }),
        order({ id: "PS-4", total: 700000, createdAt: NOW - 30 * 60 * 60_000 }), // yesterday
      ],
      NOW,
    );
    expect(stats.orders).toBe(2);
    expect(stats.revenue).toBe(150000);
    expect(stats.average).toBe(75000);
    expect(stats.cancelled).toBe(1);
  });

  it("answers zeros, not NaN, for a freshly approved shop", () => {
    expect(todayStats([], NOW)).toEqual({ orders: 0, revenue: 0, average: 0, cancelled: 0 });
  });
});

describe("newOrderIds / shopPath", () => {
  it("finds only the orders the dashboard has not seen, oldest first", () => {
    const orders = [order({ id: "PS-3" }), order({ id: "PS-2" }), order({ id: "PS-1" })];
    expect(newOrderIds(["PS-1"], orders)).toEqual(["PS-2", "PS-3"]);
    expect(newOrderIds(["PS-1", "PS-2", "PS-3"], orders)).toEqual([]);
  });

  it("builds a shareable storefront path", () => {
    expect(shopPath("arian-fashion")).toBe("/shops/arian-fashion");
    expect(shopPath("bhai's shop")).toBe("/shops/bhai's%20shop");
  });
});
