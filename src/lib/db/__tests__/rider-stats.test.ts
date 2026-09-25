/**
 * Rider scoreboard (202609250008): getRiderStats reads lifetime + 7-day +
 * rating; applyDeliveryRating recomputes the average from the ratings table
 * (a recompute can never drift).
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { applyDeliveryRating, getRiderStats } from "../riders";

describe("getRiderStats", () => {
  it("reads lifetime + week + rating into one view", async () => {
    const single = vi.fn().mockResolvedValue({
      data: { total_deliveries: 41, rating_avg: "4.8", rating_count: 12 },
      error: null,
    });
    const service = {
      from: () => ({
        select: () => ({
          // riders: …eq(id).single()
          // delivery_assignments: …eq.eq.gte(week) → awaited plain object
          eq: () => ({ single, eq: () => ({ gte: () => ({ count: 9, error: null }) }) }),
        }),
      }),
    };
    const stats = await getRiderStats(service as never, "rider-1");
    expect(stats).toEqual({
      totalDeliveries: 41,
      weekDeliveries: 9,
      ratingAvg: 4.8,
      ratingCount: 12,
    });
  });

  it("tolerates an unrated rider and empty counters", async () => {
    const single = vi.fn().mockResolvedValue({ data: null, error: { message: "no row" } });
    const service = {
      from: () => ({
        select: () => ({
          eq: () => ({ single, eq: () => ({ gte: () => ({ count: null, error: null }) }) }),
        }),
      }),
    };
    const stats = await getRiderStats(service as never, "rider-1");
    expect(stats).toEqual({
      totalDeliveries: 0,
      weekDeliveries: 0,
      ratingAvg: 0,
      ratingCount: 0,
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
