/**
 * Failed delivery routes (202610010001 — audit N5):
 *   POST /api/rider/assignments/:id/failed        — rider reports an attempt
 *   POST /api/admin/orders/:id/failed-delivery    — staff redispatch / cancel
 * The real route wrappers run; only the session and the DB layer are faked.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const RIDER_DB = vi.hoisted(() => ({ kind: "rider-jwt" }));
const SERVICE = vi.hoisted(() => ({ kind: "service-role" }));
const STAFF_DB = vi.hoisted(() => ({ kind: "staff-jwt" }));

const state = vi.hoisted(() => ({
  attempts: [] as { db: unknown; id: string; reason: string; service: unknown }[],
  attemptResult: { final: false, attempts: 1, maxAttempts: 2 } as unknown,
  resolutions: [] as { db: unknown; ref: string; action: string; note?: string }[],
  releases: [] as { db: unknown; id: string; reason: string }[],
}));

vi.mock("@/lib/rider-auth", () => ({
  RiderAuthError: class RiderAuthError extends Error {},
  requireRider: async () => ({
    rider: { id: "r1" },
    db: RIDER_DB,
    service: SERVICE,
    user: { id: "u-failed-route" },
    email: "r@example.com",
  }),
}));
vi.mock("@/lib/staff-auth", () => ({
  StaffAuthError: class StaffAuthError extends Error {},
  requireStaff: async () => ({ user: { id: "staff-failed-route" }, db: STAFF_DB, role: "admin" }),
  requireStaffRole: async () => ({ user: { id: "staff-failed-route" }, db: STAFF_DB, role: "admin" }),
}));
vi.mock("@/lib/db/riders", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/db/riders")>();
  return {
    ...orig,
    failedRiderAttempt: async (db: unknown, id: string, reason: string, service: unknown) => {
      state.attempts.push({ db, id, reason, service });
      return state.attemptResult;
    },
    releaseDispatchAssignment: async (db: unknown, id: string, reason: string) => {
      state.releases.push({ db, id, reason });
    },
    resolveFailedDelivery: async (db: unknown, ref: string, action: string, note?: string) => {
      state.resolutions.push({ db, ref, action, note });
    },
  };
});

import { POST as riderFailed } from "../rider/assignments/[id]/failed/route";
import { POST as adminRelease } from "../admin/deliveries/[id]/release/route";
import { POST as adminResolve } from "../admin/orders/[id]/failed-delivery/route";

const json = (body: unknown) => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  state.attempts = [];
  state.resolutions = [];
  state.releases = [];
  state.attemptResult = { final: false, attempts: 1, maxAttempts: 2 };
});

describe("POST /api/rider/assignments/:id/failed", () => {
  it("calls the RPC with the rider's JWT client and echoes final/attempts", async () => {
    state.attemptResult = { final: true, attempts: 2, maxAttempts: 2 };
    const res = await riderFailed(
      new Request("http://localhost/x", json({ reason: "  address does not exist " })),
      ctx("asg-1"),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ failed: true, final: true, attempts: 2, maxAttempts: 2 });
    expect(state.attempts[0]).toMatchObject({ db: RIDER_DB, id: "asg-1", reason: "address does not exist", service: SERVICE });
  });

  it("refuses a reason shorter than five characters before the RPC", async () => {
    const res = await riderFailed(new Request("http://localhost/x", json({ reason: "no" })), ctx("asg-1"));
    expect(res.status).toBe(422);
    expect(state.attempts).toHaveLength(0);
  });
});

describe("POST /api/admin/orders/:id/failed-delivery", () => {
  it("redispatches on the staff's JWT client", async () => {
    const res = await adminResolve(
      new Request("http://localhost/x", json({ action: "redispatch" })),
      ctx("PS-20261001-0001"),
    );
    expect(res.status).toBe(200);
    expect(state.resolutions).toEqual([
      { db: STAFF_DB, ref: "PS-20261001-0001", action: "redispatch", note: "" },
    ]);
  });

  it("needs a reason to cancel", async () => {
    const bad = await adminResolve(
      new Request("http://localhost/x", json({ action: "cancel", note: " " })),
      ctx("PS-20261001-0001"),
    );
    expect(bad.status).toBe(422);
    const ok = await adminResolve(
      new Request("http://localhost/x", json({ action: "cancel", note: "customer unreachable" })),
      ctx("PS-20261001-0001"),
    );
    expect(ok.status).toBe(200);
    expect(state.resolutions).toHaveLength(1);
  });

  it("refuses an unknown action", async () => {
    const res = await adminResolve(
      new Request("http://localhost/x", json({ action: "explode" })),
      ctx("PS-20261001-0001"),
    );
    expect(res.status).toBe(422);
    expect(state.resolutions).toHaveLength(0);
  });
});

describe("POST /api/admin/deliveries/:id/release", () => {
  const ASG = "22222222-2222-4222-8222-222222222222";

  it("releases on the staff's JWT client", async () => {
    const res = await adminRelease(
      new Request("http://localhost/x", json({ reason: " rider unreachable " })),
      ctx(ASG),
    );
    expect(res.status).toBe(200);
    expect(state.releases).toEqual([{ db: STAFF_DB, id: ASG, reason: "rider unreachable" }]);
  });

  it("needs a real assignment id and a reason before the RPC", async () => {
    expect((await adminRelease(new Request("http://localhost/x", json({ reason: "rider unreachable" })), ctx("nope"))).status).toBe(422);
    expect((await adminRelease(new Request("http://localhost/x", json({ reason: "no" })), ctx(ASG))).status).toBe(422);
    expect(state.releases).toHaveLength(0);
  });
});
