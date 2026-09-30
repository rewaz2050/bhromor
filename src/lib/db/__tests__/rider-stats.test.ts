/**
 * Rider scoreboard (202609250008): getRiderStats reads lifetime + 7-day +
 * rating; applyDeliveryRating recomputes the average from the ratings table
 * (a recompute can never drift).
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { applyDeliveryRating, getRiderStats } from "../riders";

describe("getRiderStats", () => {
  /** Chain stubs matching the real reads: riders.select().eq().single()
   *  and delivery_assignments.select().eq().eq().gte(). */
  const service = (opts: {
    riderFirst: { data?: unknown; error?: unknown };
    riderRetry?: { data?: unknown; error?: unknown };
    gte: { count: number | null; error: unknown } | ((cols: string) => { count: number | null; error: unknown });
  }) => ({
    from: (table: string) => ({
      select: (cols: string) => ({
        eq: () => ({
          single: async () => {
            if (table !== "riders") return { data: null, error: null };
            if (cols.includes("earnings_balance")) return opts.riderFirst;
            return opts.riderRetry ?? opts.riderFirst;
          },
          eq: () => ({
            gte: async () =>
              typeof opts.gte === "function" ? opts.gte(cols) : opts.gte,
          }),
        }),
      }),
    }),
  });

  it("reads lifetime + week + rating + the tip wallet into one view", async () => {
    const svc = service({
      riderFirst: {
        data: {
          total_deliveries: 41,
          rating_avg: "4.8",
          rating_count: 12,
          earnings_balance: 1500,
        },
        error: null,
      },
      gte: { count: 9, error: null },
    });
    const stats = await getRiderStats(svc as never, "rider-1");
    expect(stats).toEqual({
      totalDeliveries: 41,
      weekDeliveries: 9,
      ratingAvg: 4.8,
      ratingCount: 12,
      earningsBalance: 1500,
    });
  });

  it("counts the week on delivered_at, not on orders.updated_at", async () => {
    const svc = service({
      riderFirst: { data: {}, error: null },
      // The stub answers 99 for the legacy join query — the fresh 4 must win.
      gte: (cols) => ({ count: cols === "id" ? 4 : 99, error: null }),
    });
    const stats = await getRiderStats(svc as never, "rider-1");
    expect(stats.weekDeliveries).toBe(4);
  });

  it("tolerates an unrated rider and empty counters", async () => {
    const svc = service({
      riderFirst: { data: null, error: { message: "no row" } },
      gte: { count: null, error: null },
    });
    const stats = await getRiderStats(svc as never, "rider-1");
    expect(stats).toEqual({
      totalDeliveries: 0,
      weekDeliveries: 0,
      ratingAvg: 0,
      ratingCount: 0,
      earningsBalance: 0,
    });
  });

  it("degrades to the pre-202609300001 basis when the new column/table are not applied", async () => {
    const svc = service({
      riderFirst: {
        data: null,
        error: { code: "42703", message: 'column "earnings_balance" does not exist' },
      },
      riderRetry: {
        data: { total_deliveries: 7, rating_avg: "5", rating_count: 2 },
        error: null,
      },
      gte: (cols) =>
        cols === "id"
          ? {
              count: null,
              error: { code: "PGRST204", message: "Could not find the 'delivered_at' column" },
            }
          : { count: 3, error: null },
    });
    const stats = await getRiderStats(svc as never, "rider-1");
    expect(stats).toEqual({
      totalDeliveries: 7,
      weekDeliveries: 3,
      ratingAvg: 5,
      ratingCount: 2,
      earningsBalance: 0,
    });
  });
});

describe("applyDeliveryRating", () => {
  const build = (rows: { stars: number }[]) => {
    const update = vi.fn(() => ({
      eq: vi.fn().mockResolvedValue({ error: null }),
    }));
    const service = {
      from: (table: string) =>
        table === "delivery_ratings"
          ? {
              select: () => ({
                eq: () => Promise.resolve({ data: rows, error: null }),
              }),
            }
          : { update },
    };
    return { service, update };
  };

  it("recomputes the average and count from the table", async () => {
    const { service, update } = build([{ stars: 5 }, { stars: 4 }, { stars: 4 }]);
    await applyDeliveryRating(service as never, "rider-1");
    expect(update).toHaveBeenCalledWith({ rating_avg: 4.3, rating_count: 3 });
  });

  it("zeroes the scoreboard when no ratings exist", async () => {
    const { service, update } = build([]);
    await applyDeliveryRating(service as never, "rider-1");
    expect(update).toHaveBeenCalledWith({ rating_avg: 0, rating_count: 0 });
  });
});
