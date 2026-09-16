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
  orderFlowSchemaGap,
  verifyPaymentAsStaff,
} from "../admin";

const REPAIR = "202609160003_order_status_update_repair.sql";

const fakeDb = (rpcError: { code?: string; message: string }) =>
  ({
    from: (_table: string) => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: { id: "order-uuid" }, error: null }),
        }),
      }),
    }),
    rpc: async (_fn: string, _args: unknown) => ({ error: rpcError }),
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
