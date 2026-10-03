import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { adjustRiderWallet, listDisputesForStaff, listRiderDisputes, raiseRiderDispute, resolveDispute } from "../rider-disputes";

const row = {
  id: "d1", rider_id: "r1", category: "missing_fee", message: "fee missing", claimed_amount: "4000", status: "pending",
  adjustment_amount: "0", note: null, created_at: "2026-10-01T04:00:00Z", decided_at: null,
  riders: { name: "Rafiq" }, orders: [{ order_no: "PS-1001" }],
};

const rpcDb = (result: { data?: unknown; error?: { message?: string; code?: string } | null }) => {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  return {
    calls,
    db: { rpc: async (fn: string, args: Record<string, unknown>) => { calls.push({ fn, args }); return { data: result.data ?? null, error: result.error ?? null }; } } as never,
  };
};

const tableDb = (result: { data?: unknown; error?: { message?: string; code?: string } | null }) => {
  const ops: string[] = [];
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq", "neq", "order", "limit"]) chain[m] = (...a: unknown[]) => { ops.push(`${m}:${a.join(",")}`); return chain; };
  chain.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: result.data ?? null, error: result.error ?? null }).then(ok);
  return { ops, db: { from: () => chain } as never };
};

describe("raiseRiderDispute", () => {
  const input = { assignmentId: "a1", category: "missing_fee" as const, message: "fee missing", claimed: 4000 };
  it("passes the rider's input through the RPC on the rider client", async () => {
    const { db, calls } = rpcDb({ data: row });
    const d = await raiseRiderDispute(db, input);
    expect(calls[0]).toEqual({ fn: "ps_rider_raise_dispute", args: { p_assignment_id: "a1", p_category: "missing_fee", p_message: "fee missing", p_claimed: 4000 } });
    expect(d).toMatchObject({ id: "d1", status: "pending", claimedAmount: 4000 });
  });
  it.each([
    ["not your trip", 403],
    ["dispute already open", 409],
    ["too many open disputes", 409],
    ["rider not active", 403],
    ["trip required", 422],
    ["message too short", 422],
    ["something odd", 422],
  ])("maps %s to a Bangla %i", async (message, status) => {
    const { db } = rpcDb({ error: { message } });
    await expect(raiseRiderDispute(db, input)).rejects.toMatchObject({ status });
  });
  it("tells the rider the feature is off when the function is missing", async () => {
    const { db } = rpcDb({ error: { code: "42883", message: "function ps_rider_raise_dispute does not exist" } });
    await expect(raiseRiderDispute(db, input)).rejects.toMatchObject({ status: 503 });
  });
});

describe("readers", () => {
  it("rider list maps rows (order number from the embedded order) and is scoped to the rider", async () => {
    const { db, ops } = tableDb({ data: [row] });
    const r = await listRiderDisputes(db, "r1");
    expect(r.ready).toBe(true);
    expect(r.items[0]).toMatchObject({ orderNo: "PS-1001", claimedAmount: 4000 });
    expect(ops).toContain("eq:rider_id,r1");
  });
  it("is not-ready (not an error) when the table is missing", async () => {
    const { db } = tableDb({ error: { code: "42P01", message: "relation rider_disputes does not exist" } });
    expect(await listRiderDisputes(db, "r1")).toEqual({ ready: false, items: [] });
    expect(await listDisputesForStaff(db, "pending")).toBeNull();
  });
  it("staff list carries the rider name and filters pending vs decided", async () => {
    const a = tableDb({ data: [row] });
    const items = await listDisputesForStaff(a.db, "pending");
    expect(items?.[0]).toMatchObject({ riderId: "r1", riderName: "Rafiq" });
    expect(a.ops).toContain("eq:status,pending");
    const b = tableDb({ data: [] });
    await listDisputesForStaff(b.db, "decided");
    expect(b.ops).toContain("neq:status,pending");
  });
});

describe("staff writes", () => {
  it("resolve calls the RPC on the staff client with the note (null when empty)", async () => {
    const { db, calls } = rpcDb({ data: { ...row, status: "approved", adjustment_amount: 4000, note: "ok" } });
    const d = await resolveDispute(db, "d1", { decision: "approve", amount: 4000, note: "ok" });
    expect(calls[0]).toEqual({ fn: "ps_admin_resolve_dispute", args: { p_id: "d1", p_decision: "approve", p_amount: 4000, p_note: "ok" } });
    expect(d).toMatchObject({ status: "approved", adjustmentAmount: 4000, riderId: "r1" });
    const r2 = rpcDb({ data: row });
    await resolveDispute(r2.db, "d1", { decision: "approve", amount: 0, note: "" });
    expect(r2.calls[0].args.p_note).toBeNull();
  });
  it.each([
    ["dispute already approved", 409],
    ["would make wallet negative", 422],
    ["forbidden", 403],
    ["dispute not found", 404],
    ["amount too large", 422],
  ])("maps %s to %i", async (message, status) => {
    const { db } = rpcDb({ error: { message } });
    await expect(resolveDispute(db, "d1", { decision: "approve", amount: 1, note: "x" })).rejects.toMatchObject({ status });
    await expect(adjustRiderWallet(db, "r1", { amount: 1, note: "reason" })).rejects.toMatchObject({ status });
  });
  it("adjust returns the journal row", async () => {
    const { db, calls } = rpcDb({ data: { id: "e1", amount: "-1500" } });
    expect(await adjustRiderWallet(db, "r1", { amount: -1500, note: "Damaged parcel" })).toEqual({ id: "e1", amount: -1500 });
    expect(calls[0]).toEqual({ fn: "ps_admin_adjust_rider", args: { p_rider_id: "r1", p_amount: -1500, p_note: "Damaged parcel" } });
  });
  it("says which migration to run when the functions are missing", async () => {
    const { db } = rpcDb({ error: { code: "42883", message: "function does not exist" } });
    await expect(adjustRiderWallet(db, "r1", { amount: 1, note: "reason" })).rejects.toThrow(/202610020007/);
  });
});
