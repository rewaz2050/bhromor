import { describe, expect, it } from "vitest";
import {
  ACTION_SLA_MS,
  RIDER_SLA_MS,
  buildTodaysWork,
  type TodaysWorkInput,
} from "../admin-todays-work";

const NOW = 60 * 60_000;

const input = (over: Partial<TodaysWorkInput> = {}): TodaysWorkInput => ({
  now: NOW,
  actionOrders: 0,
  oldestActionAt: null,
  walletPending: 0,
  waitingRider: 0,
  oldestRiderAt: null,
  lowStock: 0,
  reviewsPending: 0,
  ...over,
});

describe("buildTodaysWork", () => {
  it("is empty when every queue is clear", () => {
    expect(buildTodaysWork(input())).toEqual([]);
  });

  it("only lists queues that have something in them", () => {
    const rows = buildTodaysWork(
      input({ actionOrders: 3, oldestActionAt: NOW - 5 * 60_000, lowStock: 2 }),
    );
    expect(rows.map((r) => r.id)).toEqual(["orders", "stock"]);
  });

  it("says how long the oldest one has waited", () => {
    const rows = buildTodaysWork(
      input({ actionOrders: 2, oldestActionAt: NOW - 20 * 60_000 }),
    );
    expect(rows[0].detail).toBe("oldest waiting 20 min");
    expect(rows[0].href).toBe("/admin/orders?status=action");
  });

  it("marks an order past the 15-minute SLA urgent, not a fresh one", () => {
    const fresh = buildTodaysWork(
      input({ actionOrders: 1, oldestActionAt: NOW - 60_000 }),
    )[0];
    const late = buildTodaysWork(
      input({ actionOrders: 1, oldestActionAt: NOW - ACTION_SLA_MS - 1 }),
    )[0];
    expect(fresh.urgent).toBe(false);
    expect(late.urgent).toBe(true);
  });

  it("marks a parcel waiting past 30 minutes urgent", () => {
    const rows = buildTodaysWork(
      input({ waitingRider: 4, oldestRiderAt: NOW - RIDER_SLA_MS - 1 }),
    );
    expect(rows[0].id).toBe("rider");
    expect(rows[0].urgent).toBe(true);
    expect(rows[0].href).toBe("/admin/deliveries");
  });

  it("puts the late queue above a merely full one — people before paper", () => {
    const rows = buildTodaysWork(
      input({
        actionOrders: 1,
        oldestActionAt: NOW - 60_000,
        lowStock: 9,
        reviewsPending: 5,
        waitingRider: 1,
        oldestRiderAt: NOW - RIDER_SLA_MS - 1,
      }),
    );
    expect(rows.map((r) => r.id)).toEqual(["rider", "orders", "stock", "reviews"]);
  });

  it("keeps money in its own tone — never shouting 'late' at a TrxID", () => {
    const rows = buildTodaysWork(input({ walletPending: 2 }));
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe("wallet");
    expect(rows[0].tone).toBe("money");
    expect(rows[0].urgent).toBe(false);
    expect(rows[0].detail).toMatch(/TrxID/);
  });
});
