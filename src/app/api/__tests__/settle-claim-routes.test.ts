/**
 * Settle-claim routes (2026-09-25 P0): the rider files a claim, staff
 * approve via the existing settle endpoint or reject with a note.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const riderService = { from: vi.fn(() => ({ select: vi.fn().mockResolvedValue({ count: 0, error: null }) })) };
vi.mock("@/lib/rider-auth", () => ({
  requireRider: async () => ({ user: { id: "user-1" }, db: { rpc: vi.fn() }, service: riderService }),
  RiderAuthError: class extends Error {},
}));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: () => ({ allowed: true }) }));
vi.mock("@/lib/db/riders", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/db/riders")>();
  return {
    ...orig,
    settleRiderCash: vi.fn(async () => ({
      id: "claim-1",
      riderId: "rider-1",
      amount: 10000,
      method: "bkash",
      reference: "TRX123",
      status: "pending",
    })),
    rejectSettleClaimByAdmin: vi.fn(async () => undefined),
    settleClaimsReady: vi.fn(async () => true),
  };
});
vi.mock("../admin/_lib", async (importOriginal) => {
  const orig = await importOriginal<typeof import("../admin/_lib")>();
  return {
    ...orig,
    staffRoute: (
      _name: string,
      handler: (ctx: unknown, req: Request, routeCtx?: unknown) => unknown,
    ) => {
      const db = { rpc: vi.fn() };
      return (req: Request, routeCtx?: unknown) => handler({ db }, req, routeCtx);
    },
  };
});

import { POST as settlePost } from "../rider/settle/route";
import { POST as rejectPost } from "../admin/riders/[id]/settle-claim/route";
import { rejectSettleClaimByAdmin, settleClaimsReady } from "@/lib/db/riders";

const post = (path: string, body: unknown): Request =>
  new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

describe("POST /api/rider/settle — claim filing", () => {
  it("422s an unknown method", async () => {
    const res = await settlePost(post("/api/rider/settle", { method: "rocket" }));
    expect(res.status).toBe(422);
  });

  it("503s WITHOUT calling ps_rider_settle when the claims backend is missing", async () => {
    vi.mocked(settleClaimsReady).mockResolvedValueOnce(false);
    const res = await settlePost(post("/api/rider/settle", { method: "cash" }));
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toContain("বন্ধ");
  });

  it("422s a wallet claim without a reference", async () => {
    const res = await settlePost(post("/api/rider/settle", { method: "bkash" }));
    expect(res.status).toBe(422);
  });

  it("files the claim and returns it as pending", async () => {
    const res = await settlePost(
      post("/api/rider/settle", { method: "bkash", reference: "TRX123" }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { claimed: boolean; claim: { status: string } };
    expect(body.claimed).toBe(true);
    expect(body.claim.status).toBe("pending");
  });
});

describe("POST /api/admin/riders/:id/settle-claim — staff reject", () => {
  const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

  it("422s a malformed rider id", async () => {
    const res = await rejectPost(
      post("/x", { action: "reject" }),
      ctx("not-a-uuid"),
    );
    expect(res.status).toBe(422);
  });

  it("422s anything but an explicit reject (approvals use settle)", async () => {
    const res = await rejectPost(
      post("/x", { action: "approve" }),
      ctx("123e4567-e89b-12d3-a456-426614174000"),
    );
    expect(res.status).toBe(422);
  });

  it("rejects the pending claim with the staff note", async () => {
    const res = await rejectPost(
      post("/x", { action: "reject", note: "money never arrived" }),
      ctx("123e4567-e89b-12d3-a456-426614174000"),
    );
    expect(res.status).toBe(200);
    expect(rejectSettleClaimByAdmin).toHaveBeenCalledWith(
      expect.anything(),
      "123e4567-e89b-12d3-a456-426614174000",
      "money never arrived",
    );
  });
});
