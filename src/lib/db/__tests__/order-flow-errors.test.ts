/**
 * Admin order flow — the RPC refused the write for a SCHEMA reason (2026-09-16).
 *
 * "Mark confirmed" did nothing on the live site: ps_advance_order was raising
 * 22P02 (invalid input value for enum ps_order_status: "") from the ledger
 * trigger on every status UPDATE, and the API folded that into the same
 * generic 422 it uses for a bad button press. Verify/Reject on a bKash
 * payment failed the same silent way (42601 from ps_verify_payment's RETURN).
 *
 * These pin the contract: a schema-level refusal is logged with its SQLSTATE
 * and answered as an honest 503 that names the repair file; the rule-based
 * P0001 messages keep their existing human mappings.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  AdminInputError,
  advanceOrderAsStaff,
  isPreTwoTapRefusal,
  orderFlowSchemaGap,
  verifyPaymentAsStaff,
} from "../admin";
import { advanceVendorOrder } from "../vendor";

const REPAIR = "202609160003_order_status_update_repair.sql";

const fakeDb = (rpcError: { code?: string; message: string }) =>
  ({
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: { id: "order-uuid" }, error: null }),
        }),
      }),
    }),
    rpc: async () => ({ error: rpcError }),
  }) as never;

afterEach(() => {
  vi.restoreAllMocks();
});

describe("orderFlowSchemaGap", () => {
  it("recognises the ledger-trigger enum failure and names the repair file", () => {
    const gap = orderFlowSchemaGap({
      code: "22P02",
      message: 'invalid input value for enum ps_order_status: ""',
    });
    expect(gap).toContain(REPAIR);
    expect(gap).toContain("ps_order_status");
  });

  it("recognises ps_verify_payment's scalar-subquery RETURN", () => {
    expect(
      orderFlowSchemaGap({
        code: "42601",
        message: "subquery must return only one column",
      }),
    ).toContain(REPAIR);
  });

  it("recognises a missing RPC and a missing column", () => {
    expect(
      orderFlowSchemaGap({ code: "PGRST202", message: "function ps_advance_order does not exist" }),
    ).toMatch(/not installed/);
    expect(
      orderFlowSchemaGap({ code: "42703", message: 'column "tip_amount" does not exist' }),
    ).toMatch(/lacks/);
  });

  it("is null for the RPC's own rule messages (those keep their human mapping)", () => {
    expect(orderFlowSchemaGap({ code: "P0001", message: "illegal transition pending -> delivered" })).toBeNull();
    expect(orderFlowSchemaGap({ code: "P0001", message: "forbidden" })).toBeNull();
    expect(orderFlowSchemaGap({ message: "some surprise" })).toBeNull();
  });
});

describe("advanceOrderAsStaff — schema refusal vs rule refusal", () => {
  it("answers the enum failure as a 503 naming the repair, and logs the SQLSTATE", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      advanceOrderAsStaff(
        fakeDb({ code: "22P02", message: 'invalid input value for enum ps_order_status: ""' }),
        "PS-20260916-0001",
        "confirmed",
      ),
    ).rejects.toMatchObject({
      status: 503,
      message: expect.stringContaining(REPAIR),
    });
    expect(log).toHaveBeenCalledTimes(1);
    const line = String(log.mock.calls[0][1]);
    expect(line).toContain('"code":"22P02"');
    expect(line).toContain('"orderNo":"PS-20260916-0001"');
    expect(line).toContain('"to":"confirmed"');
    expect(line).toContain("schemaGap");
  });

  it("never says the order moved: the message states it was NOT updated", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      advanceOrderAsStaff(
        fakeDb({ code: "22P02", message: 'invalid input value for enum ps_order_status: ""' }),
        "PS-1",
        "cancelled",
      ),
    ).rejects.toMatchObject({ message: expect.stringMatching(/NOT updated/) });
  });

  it("keeps the rule mappings: illegal transition → 422, forbidden → 403, payment gate → 422", async () => {
    await expect(
      advanceOrderAsStaff(fakeDb({ code: "P0001", message: "illegal transition delivered -> confirmed" }), "PS-1", "confirmed"),
    ).rejects.toMatchObject({ status: 422, message: expect.stringMatching(/not allowed/i) });
    await expect(
      advanceOrderAsStaff(fakeDb({ code: "P0001", message: "forbidden" }), "PS-1", "confirmed"),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      advanceOrderAsStaff(fakeDb({ code: "P0001", message: "payment not verified" }), "PS-1", "preparing"),
    ).rejects.toMatchObject({ status: 422, message: expect.stringMatching(/verify or reject/i) });
  });

  it("still folds an unknown non-schema failure into the generic 422 (logged)", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      advanceOrderAsStaff(fakeDb({ message: "some surprise" }), "PS-1", "confirmed"),
    ).rejects.toMatchObject({ status: 422, message: "Could not update the order." });
    expect(log).toHaveBeenCalledTimes(1);
  });
});

/**
 * Two-tap flow (2026-09-17): a database WITHOUT 202609170001 still answers
 * "illegal transition confirmed -> ready-for-pickup". The one button must
 * keep working there — the server takes the two internal steps itself.
 */
const PRE_TWO_TAP = {
  code: "P0001",
  message: "illegal transition confirmed -> ready-for-pickup",
};

/** RPC double: first call answers with `first`; later calls are scripted. */
const scriptedDb = (
  script: ({ error: { code?: string; message: string } | null })[],
) => {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  let i = 0;
  const db = {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            single: async () => ({ data: { id: "order-uuid" }, error: null }),
          }),
          single: async () => ({ data: { id: "order-uuid" }, error: null }),
        }),
      }),
    }),
    rpc: async (fn: string, args: Record<string, unknown>) => {
      calls.push({ fn, args });
      const step = script[Math.min(i, script.length - 1)];
      i += 1;
      return step;
    },
  };
  return { db: db as never, calls };
};

describe("two-tap flow fallback (database predates 202609170001)", () => {
  it("recognises only the exact confirmed → ready-for-pickup refusal", () => {
    expect(isPreTwoTapRefusal(PRE_TWO_TAP, "ready-for-pickup")).toBe(true);
    expect(isPreTwoTapRefusal(PRE_TWO_TAP, "preparing")).toBe(false);
    expect(
      isPreTwoTapRefusal({ message: "illegal transition pending -> ready-for-pickup" }, "ready-for-pickup"),
    ).toBe(false);
    expect(isPreTwoTapRefusal({ message: "payment not verified" }, "ready-for-pickup")).toBe(false);
  });

  it("staff: takes confirmed → preparing → ready-for-pickup as two RPCs and warns about the migration", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { db, calls } = scriptedDb([
      { error: PRE_TWO_TAP },
      { error: null },
      { error: null },
    ]);
    // getOrderDetail reads the order back through a richer query chain than
    // the double provides — we only assert the RPC sequence here.
    await advanceOrderAsStaff(db, "PS-1", "ready-for-pickup", "packed").catch(() => undefined);
    expect(calls.map((c) => c.args.p_to)).toEqual([
      "ready-for-pickup",
      "preparing",
      "ready-for-pickup",
    ]);
    // the staff note travels with the final step, not the filler step
    expect(calls[1].args.p_note).toBeNull();
    expect(calls[2].args.p_note).toBe("packed");
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain("202609170001_two_tap_order_flow.sql");
  });

  it("staff: a failure on the second step is still reported (never a silent half-move)", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { db, calls } = scriptedDb([
      { error: PRE_TWO_TAP },
      { error: null },
      { error: { code: "P0001", message: "payment not verified" } },
    ]);
    await expect(
      advanceOrderAsStaff(db, "PS-1", "ready-for-pickup"),
    ).rejects.toMatchObject({ status: 422, message: expect.stringMatching(/verify or reject/i) });
    expect(calls).toHaveLength(3);
  });

  it("staff: does NOT retry for any other illegal transition", async () => {
    const { db, calls } = scriptedDb([
      { error: { code: "P0001", message: "illegal transition pending -> ready-for-pickup" } },
    ]);
    await expect(
      advanceOrderAsStaff(db, "PS-1", "ready-for-pickup"),
    ).rejects.toMatchObject({ status: 422 });
    expect(calls).toHaveLength(1);
  });

  it("vendor: same two-step fallback through advanceVendorOrder", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { db, calls } = scriptedDb([
      { error: PRE_TWO_TAP },
      { error: null },
      { error: null },
    ]);
    await advanceVendorOrder(db, "shop-1", "PS-1", "ready-for-pickup").catch(() => undefined);
    expect(calls.map((c) => c.args.p_to)).toEqual([
      "ready-for-pickup",
      "preparing",
      "ready-for-pickup",
    ]);
  });
});

describe("verifyPaymentAsStaff — schema refusal", () => {
  it("answers the scalar-subquery RETURN failure as a 503 naming the repair", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      verifyPaymentAsStaff(
        fakeDb({ code: "42601", message: "subquery must return only one column" }),
        "PS-1",
        "verified",
      ),
    ).rejects.toMatchObject({
      status: 503,
      message: expect.stringContaining(REPAIR),
    });
    expect(String(log.mock.calls[0][1])).toContain('"action":"verified"');
  });

  it("unknown failures stay a 422 AdminInputError", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      verifyPaymentAsStaff(fakeDb({ message: "some surprise" }), "PS-1", "verified"),
    ).rejects.toBeInstanceOf(AdminInputError);
  });
});
