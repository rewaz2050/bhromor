/**
 * Pending-migration degradation (2026-09-25 rider fixes).
 *
 * The rider app must keep working on a database that has not received the
 * newest `supabase/migrations/*` yet: the job feed, the settlements panel
 * and the PIN delivery flow degrade; only the money-moving settle CLAIM is
 * refused outright (the legacy function zeroes the COD balance unapproved).
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  deliverRiderAssignment,
  expireStaleAssignments,
  isMissingDbObject,
  listPendingSettleClaims,
  listRiderSettleClaim,
} from "../riders";

const MISSING_FN = { code: "42883", message: "function public.ps_x(p_force => boolean) does not exist" };
const MISSING_TABLE = {
  code: "PGRST205",
  message: "Could not find the table 'public.rider_settle_claims' in the schema cache",
};

describe("isMissingDbObject", () => {
  it("recognises Postgres and PostgREST missing-object codes", () => {
    expect(isMissingDbObject(MISSING_FN)).toBe(true);
    expect(isMissingDbObject(MISSING_TABLE)).toBe(true);
    expect(isMissingDbObject({ code: "PGRST202", message: "not found" })).toBe(true);
    expect(isMissingDbObject({ message: "relation \"public.x\" does not exist" })).toBe(true);
  });

  it("never matches real failures", () => {
    expect(isMissingDbObject({ code: "P0001", message: "forbidden" })).toBe(false);
    expect(isMissingDbObject({ message: "settle already pending" })).toBe(false);
    expect(isMissingDbObject(null)).toBe(false);
  });
});

describe("expireStaleAssignments on a pre-202609250003 database", () => {
  it("skips the sweep instead of failing the job feed", async () => {
    const rpc = vi.fn(async () => ({ data: null, error: MISSING_FN }));
    await expect(expireStaleAssignments({ rpc } as never)).resolves.toBeUndefined();
    expect(rpc).toHaveBeenCalledWith("ps_expire_stale_offers", { p_force: false });
  });

  it("still raises real sweep failures", async () => {
    const rpc = vi.fn(async () => ({ data: null, error: { message: "boom" } }));
    await expect(expireStaleAssignments({ rpc } as never)).rejects.toThrow("boom");
  });
});

describe("settle-claim reads on a pre-202609250004 database", () => {
  it("listRiderSettleClaim answers null instead of throwing", async () => {
    const service = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: MISSING_TABLE }),
      })),
    };
    await expect(listRiderSettleClaim(service as never, "rider-1")).resolves.toBeNull();
  });

  it("listRiderSettleClaim still throws on real failures", async () => {
    const service = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: { message: "boom" } }),
      })),
    };
    await expect(listRiderSettleClaim(service as never, "rider-1")).rejects.toThrow(
      "settle claim read failed",
    );
  });

  it("listPendingSettleClaims answers an empty queue instead of throwing", async () => {
    const service = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: null, error: MISSING_TABLE }),
      })),
    };
    await expect(listPendingSettleClaims(service as never)).resolves.toEqual([]);
  });
});

describe("deliverRiderAssignment on a pre-202609250005 database", () => {
  it("falls back to ps_rider_deliver when the check RPC answers 42883", async () => {
    const calls: string[] = [];
    const rpc = vi.fn(async (fn: string) => {
      calls.push(fn);
      return fn === "ps_rider_deliver_check"
        ? { data: null, error: MISSING_FN }
        : { data: { id: "asg-1" }, error: null };
    });
    await deliverRiderAssignment({ rpc } as never, "asg-1", "1234");
    expect(calls).toEqual(["ps_rider_deliver_check", "ps_rider_deliver"]);
  });
});
