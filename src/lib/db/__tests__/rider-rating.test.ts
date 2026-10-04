import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { getRiderRatingSummary } from "../rider-rating";

type Result = { data: unknown; error: unknown };
const client = (tables: Record<string, Result>, log: string[] = []) => ({
  from: (table: string) => {
    const chain: Record<string, unknown> = {};
    for (const m of ["select", "eq", "in", "order", "limit"]) {
      chain[m] = (...a: unknown[]) => {
        log.push(`${table}.${m}(${a.map((x) => (Array.isArray(x) ? x.join("|") : String(x))).join(",")})`);
        return chain;
      };
    }
    chain.then = (ok: (v: unknown) => unknown) => Promise.resolve(tables[table] ?? { data: [], error: null }).then(ok);
    return chain;
  },
});
const NOW = Date.parse("2026-10-02T10:00:00Z");

describe("getRiderRatingSummary", () => {
  it("is scoped to the rider and attaches order numbers only to low-star rows", async () => {
    const log: string[] = [];
    const out = await getRiderRatingSummary(client({
      delivery_ratings: { data: [
        { order_id: "o1", stars: 1, created_at: "2026-10-01T00:00:00Z" },
        { order_id: "o2", stars: 5, created_at: "2026-10-01T01:00:00Z" },
      ], error: null },
      orders: { data: [{ id: "o1", order_no: "PS-1" }], error: null },
    }, log) as never, "r1", NOW);
    expect(log).toContain("delivery_ratings.eq(rider_id,r1)");
    expect(log).toContain("orders.in(id,o1)");
    expect(out?.low).toEqual([{ stars: 1, at: Date.parse("2026-10-01T00:00:00Z"), orderNo: "PS-1" }]);
    expect(out?.low[0]).not.toHaveProperty("orderId");
    expect(out?.avg).toBe(3);
  });

  it("skips the orders read when nothing is low", async () => {
    const log: string[] = [];
    await getRiderRatingSummary(client({ delivery_ratings: { data: [{ order_id: "o2", stars: 5, created_at: "2026-10-01T01:00:00Z" }], error: null } }, log) as never, "r1", NOW);
    expect(log.some((l) => l.startsWith("orders."))).toBe(false);
  });

  it("null when the ratings table is not migrated; throws on a real error", async () => {
    expect(await getRiderRatingSummary(client({ delivery_ratings: { data: null, error: { message: "does not exist", code: "42P01" } } }) as never, "r1")).toBeNull();
    await expect(getRiderRatingSummary(client({ delivery_ratings: { data: null, error: { message: "boom", code: "XX000" } } }) as never, "r1")).rejects.toThrow();
  });
});
