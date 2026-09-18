/**
 * Batch H (2026-09-18) — operator-side server rules:
 *   - the SHOP may decide its own bKash/Nagad payment (verifyPaymentAsVendor)
 *     with the same rule mapping as staff;
 *   - dispatch routes accept the PUBLIC order number the admin UI holds
 *     (resolveOrderRowIds), never guessing on a miss;
 *   - "Handed to customer" on a counter pickup walks the rider states the
 *     status machine insists on — and ONLY for a pickup row;
 *   - counter pickups never appear on the awaiting-dispatch board.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { AdminInputError, advanceOrderAsStaff, counterHandover, isCounterHandoverRefusal } from "../admin";
import { verifyPaymentAsVendor } from "../vendor";
import {
  listAwaitingDispatchOrders,
  listDispatchJobs,
  listRiderJobs,
  resolveOrderRowIds,
} from "../riders";

afterEach(() => vi.restoreAllMocks());

/* ------------------------------------------------------------------ */
/* Doubles                                                             */
/* ------------------------------------------------------------------ */

/** Chainable query double: every filter returns itself, terminal calls resolve. */
const query = (rows: unknown[], calls?: { filters: [string, unknown][] }) => {
  const q: Record<string, unknown> = {};
  for (const m of ["select", "eq", "in", "order", "limit"]) {
    q[m] = (...args: unknown[]) => {
      if (calls && (m === "eq" || m === "in")) calls.filters.push([m, args]);
      return q;
    };
  }
  q.single = async () => ({ data: rows[0] ?? null, error: rows[0] ? null : { message: "0 rows" } });
  q.maybeSingle = async () => ({ data: rows[0] ?? null, error: null });
  q.then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve({ data: rows, error: null }).then(resolve);
  return q;
};

/* ------------------------------------------------------------------ */
/* verifyPaymentAsVendor                                               */
/* ------------------------------------------------------------------ */

describe("verifyPaymentAsVendor", () => {
  const dbWith = (rpcError: { code?: string; message: string } | null, found = true) => {
    const rpc = vi.fn(async () => ({ error: rpcError }));
    const filters: [string, unknown][] = [];
    const db = {
      from: () => query(found ? [{ id: "order-uuid", order_no: "PS-1" }] : [], { filters }),
      rpc,
    } as never;
    return { db, rpc, filters };
  };

  it("scopes the lookup to the shop AND the order number, then calls ps_verify_payment with the row id", async () => {
    const { db, rpc, filters } = dbWith(null);
    // getVendorOrderDetail re-reads through a richer chain than the double
    // provides — the RPC contract is what we pin here.
    await verifyPaymentAsVendor(db, "shop-1", "ps-1", "verified", "  seen in wallet  ").catch(() => undefined);
    expect(filters).toEqual(
      expect.arrayContaining([
        ["eq", ["shop_id", "shop-1"]],
        ["eq", ["order_no", "PS-1"]],
      ]),
    );
    expect(rpc).toHaveBeenCalledWith("ps_verify_payment", {
      p_order_id: "order-uuid",
      p_action: "verified",
      p_note: "seen in wallet",
    });
  });

  it("answers 404 for an order number outside the shop (no RPC call — no oracle)", async () => {
    const { db, rpc } = dbWith(null, false);
    await expect(verifyPaymentAsVendor(db, "shop-1", "PS-OTHER", "verified")).rejects.toMatchObject({ status: 404 });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("maps the RPC's own rules like the staff path: 403 / 422 / 409 / 422", async () => {
    const cases: [string, number, RegExp][] = [
      ["forbidden", 403, /owns this order/i],
      ["not a wallet payment", 422, /cash on delivery/i],
      ["payment already decided", 409, /already decided/i],
      ["order already cancelled", 422, /cancelled/i],
    ];
    for (const [message, status, re] of cases) {
      const { db } = dbWith({ code: "P0001", message });
      await expect(verifyPaymentAsVendor(db, "shop-1", "PS-1", "rejected")).rejects.toMatchObject({
        status,
        message: expect.stringMatching(re),
      });
    }
  });

  it("names a schema-level refusal as a 503 that says the payment was NOT updated, and logs the SQLSTATE", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const { db } = dbWith({ code: "42601", message: "subquery must return only one column" });
    await expect(verifyPaymentAsVendor(db, "shop-1", "PS-1", "verified")).rejects.toMatchObject({
      status: 503,
      message: expect.stringMatching(/NOT updated/),
    });
    expect(log).toHaveBeenCalledTimes(1);
    expect(String(log.mock.calls[0][1])).toContain('"code":"42601"');
  });

  it("folds an unknown failure into a generic 422 (AdminInputError, never a raw throw)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { db } = dbWith({ message: "surprise" });
    const err = await verifyPaymentAsVendor(db, "shop-1", "PS-1", "verified").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AdminInputError);
    expect((err as AdminInputError).status).toBe(422);
  });
});

/* ------------------------------------------------------------------ */
/* resolveOrderRowIds                                                  */
/* ------------------------------------------------------------------ */

describe("resolveOrderRowIds", () => {
  const UUID = "11111111-1111-4111-8111-111111111111";
  const dbWith = (rows: { id: string; order_no: string }[]) => {
    const filters: [string, unknown][] = [];
    const from = vi.fn(() => query(rows, { filters }));
    return { db: { from } as never, from, filters };
  };

  it("passes row ids straight through without touching the database", async () => {
    const { db, from } = dbWith([]);
    expect(await resolveOrderRowIds(db, [UUID])).toEqual([UUID]);
    expect(from).not.toHaveBeenCalled();
  });

  it("looks public order numbers up case-insensitively and keeps the caller's order", async () => {
    const { db, filters } = dbWith([
      { id: "row-b", order_no: "PS-20260918-0002" },
      { id: "row-a", order_no: "PS-20260918-0001" },
    ]);
    const ids = await resolveOrderRowIds(db, ["ps-20260918-0001", UUID, "PS-20260918-0002 "]);
    expect(ids).toEqual(["row-a", UUID, "row-b"]);
    expect(filters).toEqual([["in", ["order_no", ["PS-20260918-0001", "PS-20260918-0002"]]]]);
  });

  it("answers 404 for a reference that matches nothing — a typo can never dispatch another order", async () => {
    const { db } = dbWith([{ id: "row-a", order_no: "PS-20260918-0001" }]);
    await expect(resolveOrderRowIds(db, ["PS-20260918-0001", "PS-20260918-0009"])).rejects.toMatchObject({
      status: 404,
      message: expect.stringContaining("PS-20260918-0009"),
    });
  });
});

/* ------------------------------------------------------------------ */
/* Counter pickup hand-over                                            */
/* ------------------------------------------------------------------ */

describe("counter pickup hand-over", () => {
  const REFUSAL = { code: "P0001", message: "illegal transition ready-for-pickup -> delivered" };

  it("recognises only a rider-state → delivered refusal", () => {
    expect(isCounterHandoverRefusal(REFUSAL, "delivered")).toBe(true);
    expect(isCounterHandoverRefusal({ message: "illegal transition out-for-delivery -> delivered" }, "delivered")).toBe(true);
    expect(isCounterHandoverRefusal({ message: "illegal transition confirmed -> delivered" }, "delivered")).toBe(false);
    expect(isCounterHandoverRefusal(REFUSAL, "ready-for-pickup")).toBe(false);
    expect(isCounterHandoverRefusal({ message: "payment not verified" }, "delivered")).toBe(false);
  });

  /** Scripted RPC double with an orders row + live assignments table. */
  const scripted = (opts: { isPickup: boolean; live?: { id: string }[]; failAt?: string }) => {
    const calls: { fn: string; args: Record<string, unknown> }[] = [];
    const db = {
      from: (table: string) =>
        table === "orders"
          ? query([{ id: "order-uuid", is_pickup: opts.isPickup }])
          : query(opts.live ?? []),
      rpc: async (fn: string, args: Record<string, unknown>) => {
        calls.push({ fn, args });
        if (fn === "ps_advance_order" && calls.length === 1) return { error: REFUSAL };
        if (fn === "ps_advance_order" && args.p_to === opts.failAt) {
          return { error: { code: "P0001", message: "forbidden" } };
        }
        return { data: null, error: null };
      },
    } as never;
    return { db, calls };
  };

  it("walks courier-assigned → out-for-delivery → delivered for a pickup row, note on the last step", async () => {
    const { db, calls } = scripted({ isPickup: true });
    await advanceOrderAsStaff(db, "PS-1", "delivered", "Collected at counter").catch(() => undefined);
    expect(calls.map((c) => [c.fn, c.args.p_to ?? c.args.p_assignment_id])).toEqual([
      ["ps_advance_order", "delivered"],
      ["ps_advance_order", "courier-assigned"],
      ["ps_advance_order", "out-for-delivery"],
      ["ps_advance_order", "delivered"],
    ]);
    expect(calls[1].args.p_note).toBeNull();
    expect(calls[3].args.p_note).toBe("Collected at counter");
  });

  it("withdraws a live rider offer before closing the pickup", async () => {
    const { db, calls } = scripted({ isPickup: true, live: [{ id: "asg-1" }] });
    await advanceOrderAsStaff(db, "PS-1", "delivered").catch(() => undefined);
    expect(calls[1]).toMatchObject({ fn: "ps_cancel_assignment", args: { p_assignment_id: "asg-1" } });
    expect(calls.filter((c) => c.fn === "ps_advance_order")).toHaveLength(4);
  });

  it("NEVER walks a home-delivery order: the original refusal comes back as the usual 422", async () => {
    const { db, calls } = scripted({ isPickup: false });
    await expect(advanceOrderAsStaff(db, "PS-1", "delivered")).rejects.toMatchObject({
      status: 422,
      message: expect.stringMatching(/not allowed/i),
    });
    expect(calls).toHaveLength(1);
  });

  it("reports a failure mid-walk instead of a silent half-move", async () => {
    const { db } = scripted({ isPickup: true, failAt: "out-for-delivery" });
    await expect(advanceOrderAsStaff(db, "PS-1", "delivered")).rejects.toMatchObject({ status: 403 });
  });

  it("counterHandover itself returns the refusal untouched for a non-pickup", async () => {
    const { db } = scripted({ isPickup: false });
    const err = await counterHandover(db, "order-uuid", REFUSAL.message, null);
    expect(err).toMatchObject({ message: REFUSAL.message, code: "P0001" });
  });
});

/* ------------------------------------------------------------------ */
/* Awaiting-dispatch board                                             */
/* ------------------------------------------------------------------ */

describe("listAwaitingDispatchOrders", () => {
  it("drops counter pickups before any mapping and keeps return legs", async () => {
    const tables: Record<string, unknown[]> = {
      orders: [
        { id: "o-home", status: "ready-for-pickup", is_pickup: false },
        { id: "o-counter", status: "ready-for-pickup", is_pickup: true },
        { id: "o-return", status: "ready-for-pickup", is_pickup: false, is_return: true },
      ],
      delivery_assignments: [],
    };
    const seen: string[] = [];
    const service = {
      from: (table: string) => {
        seen.push(table);
        return query(tables[table] ?? []);
      },
    } as never;
    // toDomainMany needs the full bundle reads the double cannot serve; the
    // filter happens before it, which is what this pins.
    const spy = vi.spyOn(await import("../orders"), "toDomainMany").mockImplementation(
      async (_db, rows) => rows.map((r) => ({ id: (r as { id: string }).id }) as never),
    );
    const out = await listAwaitingDispatchOrders(service);
    expect(out.map((o) => o.id)).toEqual(["o-home", "o-return"]);
    expect(spy.mock.calls[0][1].map((r) => (r as { id: string }).id)).toEqual(["o-home", "o-return"]);
  });
});

/* ------------------------------------------------------------------ */
/* Job feeds expose the PUBLIC order number                            */
/* ------------------------------------------------------------------ */

describe("job feeds carry Order.id (order number), not the row uuid", () => {
  const ORDER_UUID = "0b1c2d3e-4f50-4617-8a9b-0c1d2e3f4a5b";
  const RIDER_UUID = "9f8e7d6c-5b4a-4392-8170-6f5e4d3c2b1a";
  const tables: Record<string, unknown[]> = {
    delivery_assignments: [
      {
        id: "asg-1",
        order_id: ORDER_UUID,
        rider_id: RIDER_UUID,
        state: "accepted",
        offered_at: "2026-09-18T10:00:00Z",
        expires_at: "2026-09-18T10:01:30Z",
      },
    ],
    orders: [{ id: ORDER_UUID, order_no: "PS-20260918-0042", status: "courier-assigned" }],
    riders: [{ id: RIDER_UUID, name: "Rafiq", phone: "01712345678" }],
  };
  // listRiderJobs expires stale offers first (service-only RPC).
  const rpc = vi.fn(async () => ({ error: null }));
  const service = { from: (table: string) => query(tables[table] ?? []), rpc } as never;
  const domainStub = async (_db: unknown, rows: readonly unknown[]) =>
    rows.map((r) => ({ id: (r as { order_no: string }).order_no }) as never);

  it("listDispatchJobs: the board's link and the live-map join use the order number", async () => {
    vi.spyOn(await import("../orders"), "toDomainMany").mockImplementation(domainStub);
    const [job] = await listDispatchJobs(service);
    expect(job.orderId).toBe("PS-20260918-0042");
    expect(job.order.id).toBe(job.orderId);
    expect(job.riderId).toBe(RIDER_UUID);
    expect(job.riderName).toBe("Rafiq");
    expect(job.expiresAt - job.offeredAt).toBe(90_000);
  });

  it("listRiderJobs: same identity for the rider app", async () => {
    vi.spyOn(await import("../orders"), "toDomainMany").mockImplementation(domainStub);
    const [job] = await listRiderJobs(service, RIDER_UUID);
    expect(rpc).toHaveBeenCalledWith("ps_expire_stale_offers");
    expect(job.orderId).toBe("PS-20260918-0042");
    expect(job.id).toBe("asg-1");
  });
});
