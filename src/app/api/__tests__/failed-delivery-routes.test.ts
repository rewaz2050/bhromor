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
  resolutions: [] as { db: unknown; ref: string; action: string; note?: string; payFee?: boolean }[],
  releases: [] as { db: unknown; id: string; reason: string }[],
  proofMode: 0 as 0 | 1 | 2,
  uploads: true,
  recorded: [] as Record<string, unknown>[],
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
vi.mock("@/lib/db/failed-proof", () => ({
  readFailedProofMode: async () => state.proofMode,
  recordFailedProof: async (_s: unknown, input: Record<string, unknown>) => {
    state.recorded.push(input);
  },
}));
vi.mock("@/lib/env", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/env")>();
  return { ...orig, cloudinaryCloudName: () => "demo", isCloudinaryConfigured: () => state.uploads };
});
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
    resolveFailedDelivery: async (db: unknown, ref: string, action: string, note?: string, payFee?: boolean) => {
      state.resolutions.push({ db, ref, action, note, payFee });
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
  state.proofMode = 0;
  state.uploads = true;
  state.recorded = [];
});

describe("POST /api/rider/assignments/:id/failed", () => {
  const post = (body: unknown) => riderFailed(new Request("http://localhost/x", json(body)), ctx("asg-1"));
  it("photo setting OFF: records the attempt exactly as before and stores no proof", async () => {
    const res = await post({ reason: "phone is off", proofUrl: "https://evil.example/x.jpg" });
    expect(res.status).toBe(200);
    expect(state.attempts).toHaveLength(1);
    expect(state.recorded).toEqual([{ assignmentId: "asg-1", riderId: "r1", proofUrl: null, noPhotoNote: null }]);
  });
  it("optional: a Cloudinary photo of OUR cloud is stored with the attempt", async () => {
    state.proofMode = 1;
    const res = await post({ reason: "phone is off", proofUrl: "https://res.cloudinary.com/demo/image/upload/door.jpg" });
    expect(res.status).toBe(200);
    expect(state.recorded[0]).toMatchObject({ assignmentId: "asg-1", riderId: "r1", proofUrl: "https://res.cloudinary.com/demo/image/upload/door.jpg" });
  });
  it("a photo from anywhere else is refused BEFORE the attempt is recorded", async () => {
    state.proofMode = 1;
    const res = await post({ reason: "phone is off", proofUrl: "https://evil.example/x.jpg" });
    expect(res.status).toBe(422);
    expect(state.attempts).toHaveLength(0);
    expect(state.recorded).toHaveLength(0);
  });
  it("required: no photo and no reason is refused (no attempt burned); a written reason passes and is stored", async () => {
    state.proofMode = 2;
    expect((await post({ reason: "phone is off" })).status).toBe(422);
    expect(state.attempts).toHaveLength(0);
    const ok = await post({ reason: "phone is off", noPhotoReason: "camera is broken" });
    expect(ok.status).toBe(200);
    expect(state.recorded[0]).toMatchObject({ proofUrl: null, noPhotoNote: "camera is broken" });
  });
  it("required, but uploads are not configured on the server: not demanded", async () => {
    state.proofMode = 2;
    state.uploads = false;
    expect((await post({ reason: "phone is off" })).status).toBe(200);
  });

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
      { db: STAFF_DB, ref: "PS-20261001-0001", action: "redispatch", note: "", payFee: false },
    ]);
  });

  it("passes payFee only when it is exactly true", async () => {
    await adminResolve(new Request("http://localhost/x", json({ action: "redispatch", payFee: true })), ctx("PS-1"));
    await adminResolve(new Request("http://localhost/x", json({ action: "redispatch", payFee: "yes" })), ctx("PS-2"));
    expect(state.resolutions.map((r) => r.payFee)).toEqual([true, false]);
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
