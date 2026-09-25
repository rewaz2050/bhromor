/**
 * Dispatch P0 (2026-09-25) — app-side contracts for the audit fixes:
 *   - deliver counts the PIN attempt FIRST (ps_rider_deliver_check commits
 *     the counter; a raise would roll it back), then completes delivery;
 *   - rider settle files a CLAIM (cash untouched until staff approve);
 *   - the expiry sweep runs unforced by default (10s DB throttle);
 *   - manual/re-offer RPCs map "payment not verified" to a wallet-first 422.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  RiderInputError,
  acceptRiderAssignment,
  deliverRiderAssignment,
  expireStaleAssignments,
  offerOrderForDispatch,
  settleRiderCash,
} from "../riders";
import { AdminInputError } from "../admin";

const dbWith = (impl: (fn: string) => unknown) => {
  const rpc = vi.fn(async (fn: string) => impl(fn));
  return { db: { rpc } as never, rpc };
};

describe("deliverRiderAssignment — PIN check before delivery", () => {
  it("throws 422 on a mismatch WITHOUT calling ps_rider_deliver", async () => {
    const { db, rpc } = dbWith((fn) =>
      fn === "ps_rider_deliver_check"
        ? { data: "mismatch", error: null }
        : { data: null, error: null },
    );
    await expect(deliverRiderAssignment(db, "asg-1", "0000")).rejects.toMatchObject({
      status: 422,
    } satisfies Partial<RiderInputError>);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("ps_rider_deliver_check", {
      p_assignment_id: "asg-1",
      p_code: "0000",
    });
  });

  it("throws 429 while the code entry is locked", async () => {
    const { db, rpc } = dbWith(() => ({ data: "locked", error: null }));
    await expect(deliverRiderAssignment(db, "asg-1", "1234")).rejects.toMatchObject({
      status: 429,
    } satisfies Partial<RiderInputError>);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("completes delivery after an ok check, passing the proof URL", async () => {
    const { db, rpc } = dbWith((fn) =>
      fn === "ps_rider_deliver_check"
        ? { data: "ok", error: null }
        : { data: { id: "asg-1" }, error: null },
    );
    await deliverRiderAssignment(db, "asg-1", "1234", "https://proof/x.jpg");
    expect(rpc).toHaveBeenNthCalledWith(2, "ps_rider_deliver", {
      p_assignment_id: "asg-1",
      p_code: "1234",
      p_proof_url: "https://proof/x.jpg",
    });
  });

  it("falls back to deliver-only when the check RPC is missing (pre-lockout DB)", async () => {
    const { db, rpc } = dbWith((fn) =>
      fn === "ps_rider_deliver_check"
        ? { data: null, error: { code: "PGRST202", message: "not found" } }
        : { data: { id: "asg-1" }, error: null },
    );
    await deliverRiderAssignment(db, "asg-1", "1234");
    expect(rpc).toHaveBeenCalledWith("ps_rider_deliver", {
      p_assignment_id: "asg-1",
      p_code: "1234",
      p_proof_url: null,
    });
  });

  it("maps a state refusal from the check to 409", async () => {
    const { db } = dbWith(() => ({
      data: null,
      error: { code: "P0001", message: "delivery not allowed from accepted" },
    }));
    await expect(deliverRiderAssignment(db, "asg-1", "1234")).rejects.toMatchObject({
      status: 409,
    } satisfies Partial<RiderInputError>);
  });
});

describe("settleRiderCash — claim semantics", () => {
  const claimRow = {
    id: "claim-1",
    rider_id: "rider-1",
    amount: 10000,
    method: "bkash",
    reference: "TRX123",
    status: "pending",
    created_at: "2026-09-25T00:00:00.000Z",
  };

  it("returns the pending claim (cash moves only on staff approval)", async () => {
    const { db } = dbWith(() => ({ data: claimRow, error: null }));
    const claim = await settleRiderCash(db, "bkash", "TRX123");
    expect(claim).toMatchObject({ id: "claim-1", amount: 10000, status: "pending" });
  });

  it("maps a duplicate claim to 409 and an empty hand to 422", async () => {
    const pending = dbWith(() => ({
      data: null,
      error: { message: "settle already pending" },
    }));
    await expect(settleRiderCash(pending.db, "cash", "")).rejects.toMatchObject({
      status: 409,
    } satisfies Partial<RiderInputError>);
    const empty = dbWith(() => ({
      data: null,
      error: { message: "nothing to settle" },
    }));
    await expect(settleRiderCash(empty.db, "cash", "")).rejects.toMatchObject({
      status: 422,
    } satisfies Partial<RiderInputError>);
  });
});

describe("sweep + dispatch guards", () => {
  it("expireStaleAssignments passes p_force (default false — the DB throttles)", async () => {
    const { db, rpc } = dbWith(() => ({ data: 0, error: null }));
    await expireStaleAssignments(db);
    expect(rpc).toHaveBeenCalledWith("ps_expire_stale_offers", { p_force: false });
    await expireStaleAssignments(db, true);
    expect(rpc).toHaveBeenCalledWith("ps_expire_stale_offers", { p_force: true });
  });

  it("offerOrderForDispatch maps an unverified wallet to a verify-first 422", async () => {
    const { db } = dbWith(() => ({
      data: null,
      error: { message: "payment not verified" },
    }));
    try {
      await offerOrderForDispatch(db, "order-uuid");
      expect.unreachable("unverified wallet order must be refused");
    } catch (err) {
      expect(err).toBeInstanceOf(AdminInputError);
      expect((err as AdminInputError).status).toBe(422);
      expect((err as Error).message).toContain("Verify the customer's wallet payment first");
    }
  });

  it("acceptRiderAssignment maps a not-ready order to 409", async () => {
    const { db } = dbWith(() => ({
      data: null,
      error: { message: "order not ready for dispatch" },
    }));
    await expect(acceptRiderAssignment(db, "asg-1")).rejects.toMatchObject({
      status: 409,
    } satisfies Partial<RiderInputError>);
  });
});
