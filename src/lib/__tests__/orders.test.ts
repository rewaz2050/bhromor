import { describe, expect, it } from "vitest";
import {
  MOCK_ORDERS,
  ORDER_FLOW,
  TRANSITIONS,
  advanceOrder,
  aggregateOrders,
  canCancel,
  deliveryStats,
  flowIndex,
  isTerminal,
  maskPhone,
  nextActions,
  transitionAllowed,
  type Order,
} from "../orders";

const baseOrder = (): Order => {
  const seed = MOCK_ORDERS[0];
  return {
    ...seed,
    status: "pending",
    timeline: [{ status: "pending", at: seed.createdAt }],
  };
};

describe("order status state machine (§34)", () => {
  it("moves strictly forward along the blueprint flow", () => {
    for (let i = 0; i < ORDER_FLOW.length - 1; i++) {
      const from = ORDER_FLOW[i];
      const to = ORDER_FLOW[i + 1];
      expect(transitionAllowed(from, to), `${from} → ${to}`).toBe(true);
    }
    // no skipping ahead
    expect(transitionAllowed("pending", "delivered")).toBe(false);
    expect(transitionAllowed("confirmed", "out-for-delivery")).toBe(false);
  });

  it("never moves backwards", () => {
    for (const from of ORDER_FLOW) {
      for (const to of ORDER_FLOW) {
        if (flowIndex(to) <= flowIndex(from) && from !== to) {
          expect(transitionAllowed(from, to), `${from} → ${to}`).toBe(false);
        }
      }
    }
  });

  it("allows cancellation only from early statuses", () => {
    expect(canCancel("pending")).toBe(true);
    expect(canCancel("confirmed")).toBe(true);
    expect(canCancel("preparing")).toBe(true);
    expect(canCancel("courier-assigned")).toBe(false);
    expect(canCancel("out-for-delivery")).toBe(false);
    expect(canCancel("delivered")).toBe(false);
  });

  it("treats delivered/cancelled as terminal", () => {
    expect(isTerminal("delivered")).toBe(true);
    expect(isTerminal("cancelled")).toBe(true);
    expect(isTerminal("pending")).toBe(false);
  });

  it("exposes the happy-path next step as the primary action", () => {
    expect(nextActions("preparing")).toEqual(["ready-for-pickup"]);
    expect(nextActions("delivered")).toEqual([]);
  });
});

describe("advanceOrder", () => {
  it("appends a timeline entry and updates status", () => {
    const at = 1_700_000_000_000;
    const next = advanceOrder(baseOrder(), "confirmed", at);
    expect(next).not.toBeNull();
    expect(next!.status).toBe("confirmed");
    expect(next!.timeline).toHaveLength(2);
    expect(next!.timeline[1]).toEqual({
      status: "confirmed",
      at,
      note: undefined,
    });
  });

  it("rejects illegal transitions without mutating", () => {
    const order = baseOrder();
    const next = advanceOrder(order, "delivered");
    expect(next).toBeNull();
    expect(order.status).toBe("pending");
    expect(order.timeline).toHaveLength(1);
  });

  it("records deliveredMinutes when an order reaches the doorstep", () => {
    const order = baseOrder();
    const placed = order.createdAt;
    let next: Order | null = order;
    for (const s of ["confirmed", "preparing", "ready-for-pickup", "courier-assigned", "out-for-delivery"] as const) {
      next = advanceOrder(next!, s, placed + 5 * 60_000);
      expect(next, s).not.toBeNull();
    }
    const delivered = advanceOrder(next!, "delivered", placed + 46 * 60_000);
    expect(delivered!.deliveredMinutes).toBe(46);
    expect(delivered!.status).toBe("delivered");
  });
});

describe("order data integrity (§69–70, §75)", () => {
  it("uses public PS- IDs only", () => {
    for (const o of MOCK_ORDERS) {
      expect(o.id).toMatch(/^PS-\d{8}-\d{4}$/);
    }
  });

  it("stores item snapshots with unit price in paisa", () => {
    for (const o of MOCK_ORDERS) {
      for (const item of o.items) {
        expect(Number.isInteger(item.unitPrice)).toBe(true);
        expect(item.name.length).toBeGreaterThan(0);
        expect(item.sku).toMatch(/^PS-/);
        expect(item.qty).toBeGreaterThan(0);
      }
      const subtotal = o.items.reduce(
        (sum, it) => sum + it.unitPrice * it.qty,
        0,
      );
      expect(o.subtotal).toBe(subtotal);
      expect(o.total).toBe(o.subtotal + o.deliveryCharge);
    }
  });

  it("keeps an unbroken status history for every order", () => {
    for (const o of MOCK_ORDERS) {
      expect(o.timeline[0].status).toBe("pending");
      expect(o.timeline.at(-1)!.status).toBe(o.status);
      for (const [i, entry] of o.timeline.entries()) {
        if (i > 0) {
          expect(entry.at).toBeGreaterThanOrEqual(o.timeline[i - 1].at);
          if (entry.status !== "cancelled") {
            expect(
              flowIndex(entry.status),
              `${o.id} step ${entry.status}`,
            ).toBeGreaterThan(flowIndex(o.timeline[i - 1].status));
          }
        }
      }
    }
  });

  it("masks customer phone numbers for staff views", () => {
    expect(maskPhone("01712345678")).toBe("017****78");
    expect(maskPhone("1967")).toBe("1967");
  });
});

describe("aggregates & delivery performance (§32, §88)", () => {
  it("counts every status bucket", () => {
    const agg = aggregateOrders(MOCK_ORDERS);
    const total = Object.values(agg.byStatus).reduce((a, b) => a + b, 0);
    expect(total).toBe(MOCK_ORDERS.length);
    expect(agg.newOrders).toBe(agg.byStatus.pending + agg.byStatus.confirmed);
  });

  it("excludes cancelled orders from sales totals", () => {
    const agg = aggregateOrders(MOCK_ORDERS);
    const cancelled = MOCK_ORDERS.filter((o) => o.status === "cancelled");
    expect(cancelled.length).toBeGreaterThan(0);
    expect(agg.byStatus.cancelled).toBe(cancelled.length);
    // today's sales only add non-cancelled orders
    const aggWithoutCancelled = aggregateOrders(
      MOCK_ORDERS.filter((o) => o.status !== "cancelled"),
    );
    expect(aggWithoutCancelled.todaySales).toBe(agg.todaySales);
  });

  it("computes average/median and the <50-min delivery KPI", () => {
    const delivered = MOCK_ORDERS.filter(
      (o) => o.status === "delivered" && o.deliveredMinutes,
    );
    const stats = deliveryStats(MOCK_ORDERS);
    expect(stats.count).toBe(delivered.length);
    const mins = delivered.map((o) => o.deliveredMinutes!);
    const avg = Math.round(mins.reduce((a, b) => a + b, 0) / mins.length);
    expect(stats.averageMinutes).toBe(avg);
    expect(stats.medianMinutes).toBeGreaterThanOrEqual(1);
    expect(stats.under50Pct).toBeGreaterThanOrEqual(0);
    expect(stats.under50Pct).toBeLessThanOrEqual(100);
  });

  it("handles an empty set gracefully", () => {
    expect(deliveryStats([])).toEqual({
      count: 0,
      averageMinutes: 0,
      medianMinutes: 0,
      under50: 0,
      under50Pct: 0,
    });
    expect(TRANSITIONS.pending).toContain("confirmed");
  });
});
