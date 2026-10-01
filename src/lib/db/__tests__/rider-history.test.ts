import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { dhakaMidnightIso, getRiderToday, listRiderHistory } from "../rider-history";

type Result = { data: unknown; error: unknown };

/** A query builder that records its filters and resolves per table. */
const client = (tables: Record<string, Result>, log: string[] = []) => ({
  from: (table: string) => {
    const chain: Record<string, unknown> = {};
    for (const m of ["select", "order", "limit", "in", "eq", "lt", "gte"]) {
      chain[m] = (...args: unknown[]) => {
        log.push(`${table}.${m}(${args.map((a) => (Array.isArray(a) ? a.join("|") : String(a))).join(",")})`);
        return chain;
      };
    }
    chain.then = (ok: (v: unknown) => unknown) => Promise.resolve(tables[table] ?? { data: [], error: null }).then(ok);
    return chain;
  },
});

const assignment = (id: string, state: string, order: string, at = "2026-10-01T04:00:00Z", extra = {}) => ({
  id, order_id: order, state, offered_at: at, ...extra,
});

describe("listRiderHistory (Phase C)", () => {
  it("shows delivered and failed trips with the earned amount and the COD cash", async () => {
    const log: string[] = [];
    const out = await listRiderHistory(
      client({
        delivery_assignments: { data: [
          assignment("a1", "delivered", "o1", "2026-10-01T04:00:00Z", { delivered_at: "2026-10-01T05:00:00Z" }),
          assignment("a2", "failed", "o2", "2026-09-30T04:00:00Z", { failed_reason: "customer not answering" }),
        ], error: null },
        orders: { data: [
          { id: "o1", order_no: "PS-1", shop_id: "s1", area: "Kandirpar", total: "50000", payment: "cod", is_return: false },
          { id: "o2", order_no: "PS-2", shop_id: "s1", area: "Haji Para", total: "20000", payment: "cod", is_return: false },
        ], error: null },
        rider_earnings: { data: [{ order_id: "o1", amount: "4000", kind: "delivery_fee" }, { order_id: "o1", amount: 1000, kind: "tip" }], error: null },
        shops: { data: [{ id: "s1", name: "Arian Fashion" }], error: null },
      }, log) as never,
      "r1",
    );
    expect(log).toContain("delivery_assignments.in(state,delivered|failed)");
    expect(log).toContain("delivery_assignments.eq(rider_id,r1)");
    expect(out.items[0]).toMatchObject({ orderNo: "PS-1", outcome: "delivered", earned: 5000, cash: 50000, shopName: "Arian Fashion", area: "Kandirpar" });
    expect(out.items[0].at).toBe(Date.parse("2026-10-01T05:00:00Z"));
    expect(out.items[1]).toMatchObject({ outcome: "failed", cash: 0, earned: 0, failedReason: "customer not answering" });
    expect(out.nextCursor).toBeNull();
  });

  it("collects no cash on wallet-paid orders or return legs", async () => {
    const out = await listRiderHistory(
      client({
        delivery_assignments: { data: [assignment("a1", "delivered", "o1"), assignment("a2", "delivered", "o2")], error: null },
        orders: { data: [
          { id: "o1", order_no: "PS-1", shop_id: null, area: "", total: 9000, payment: "bkash" },
          { id: "o2", order_no: "PS-2", shop_id: null, area: "", total: 0, payment: "cod", is_return: true },
        ], error: null },
      }) as never,
      "r1",
    );
    expect(out.items.map((i) => i.cash)).toEqual([0, 0]);
    expect(out.items[1].isReturn).toBe(true);
  });

  it("pages: asks for one extra row, applies the cursor and returns the next one", async () => {
    const log: string[] = [];
    const rows = Array.from({ length: 3 }, (_, i) => assignment(`a${i}`, "delivered", `o${i}`, `2026-10-0${3 - i}T04:00:00Z`));
    const out = await listRiderHistory(
      client({
        delivery_assignments: { data: rows, error: null },
        orders: { data: rows.map((r) => ({ id: r.order_id, order_no: r.order_id, shop_id: null, area: "", total: 1, payment: "cod" })), error: null },
      }, log) as never,
      "r1",
      { before: "2026-10-09T00:00:00.000Z", limit: 2 },
    );
    expect(log).toContain("delivery_assignments.limit(3)");
    expect(log).toContain("delivery_assignments.lt(offered_at,2026-10-09T00:00:00.000Z)");
    expect(out.items).toHaveLength(2);
    expect(out.nextCursor).toBe("2026-10-02T04:00:00Z");
  });

  it("an unmigrated rider_earnings table only drops the amounts; a real failure throws", async () => {
    const out = await listRiderHistory(
      client({
        delivery_assignments: { data: [assignment("a1", "delivered", "o1")], error: null },
        orders: { data: [{ id: "o1", order_no: "PS-1", shop_id: null, area: "", total: 1, payment: "cod" }], error: null },
        rider_earnings: { data: null, error: { code: "42P01", message: "relation does not exist" } },
      }) as never,
      "r1",
    );
    expect(out.items[0].earned).toBe(0);
    await expect(
      listRiderHistory(client({ delivery_assignments: { data: null, error: { message: "boom" } } }) as never, "r1"),
    ).rejects.toThrow("history read failed");
  });

  it("empty history", async () => {
    expect(await listRiderHistory(client({ delivery_assignments: { data: [], error: null } }) as never, "r1")).toEqual({ items: [], nextCursor: null });
  });
});

describe("getRiderToday (Phase C2)", () => {
  it("Dhaka midnight is UTC+6 (18:00 UTC the evening before)", () => {
    expect(dhakaMidnightIso(Date.parse("2026-10-01T10:00:00Z"))).toBe("2026-09-30T18:00:00.000Z");
    // 19:00 UTC is already the next Dhaka day
    expect(dhakaMidnightIso(Date.parse("2026-10-01T19:00:00Z"))).toBe("2026-10-01T18:00:00.000Z");
  });

  it("counts today's delivered trips and sums only earning kinds since midnight", async () => {
    const log: string[] = [];
    const c = client({
      delivery_assignments: { data: null, error: null, count: 4 } as never,
      rider_earnings: { data: [{ amount: "4000" }, { amount: 1000 }], error: null },
    }, log);
    const out = await getRiderToday(c as never, "r1", Date.parse("2026-10-01T10:00:00Z"));
    expect(out).toEqual({ todayDeliveries: 4, todayEarned: 5000 });
    expect(log).toContain("delivery_assignments.gte(delivered_at,2026-09-30T18:00:00.000Z)");
    expect(log).toContain("rider_earnings.in(kind,tip|delivery_fee|cod_handling|incentive)");
  });

  it("omits a figure whose table or column is missing instead of failing", async () => {
    const out = await getRiderToday(client({
      delivery_assignments: { data: null, error: { message: "column delivered_at does not exist" } },
      rider_earnings: { data: null, error: { message: "relation does not exist" } },
    }) as never, "r1");
    expect(out).toEqual({});
  });
});
