/**
 * POST /api/rider/assignments/:id/deliver — proof photo rules (audit N9).
 * The real route + wrapper run; session, DB layer and push are faked.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const RIDER_DB = vi.hoisted(() => ({ kind: "rider-jwt" }));
const SERVICE = vi.hoisted(() => ({ kind: "service-role" }));
const state = vi.hoisted(() => ({
  delivered: [] as { db: unknown; id: string; code: string; proofUrl: unknown }[],
  noPhoto: [] as { id: string; reason: string }[],
}));

vi.mock("@/lib/rider-auth", () => ({
  RiderAuthError: class RiderAuthError extends Error {},
  requireRider: async () => ({
    rider: { id: "r1" },
    db: RIDER_DB,
    service: SERVICE,
    user: { id: "u-deliver-route" },
    email: "r@example.com",
  }),
}));
vi.mock("@/lib/supabase-server", () => ({ getSupabaseService: () => SERVICE }));
vi.mock("@/lib/customer-push", () => ({ notifyCustomerOfStatus: async () => {} }));
vi.mock("@/lib/db/riders", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/db/riders")>();
  return {
    ...orig,
    deliverRiderAssignment: async (db: unknown, id: string, code: string, proofUrl: unknown) => {
      state.delivered.push({ db, id, code, proofUrl });
    },
    assignmentOrderRef: async () => null,
    recordNoPhotoDelivery: async (_s: unknown, id: string, reason: string) => {
      state.noPhoto.push({ id, reason });
    },
  };
});

import { POST } from "../rider/assignments/[id]/deliver/route";

const CLOUD = "prosanti-demo";
const OURS = `https://res.cloudinary.com/${CLOUD}/image/upload/v1/prosanti/delivery-proofs/a.jpg`;
const call = (body: unknown) =>
  POST(
    new Request("http://localhost/x", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: "asg-1" }) },
  );

const configure = (on: boolean) => {
  vi.stubEnv("NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME", on ? CLOUD : "");
  vi.stubEnv("CLOUDINARY_API_KEY", on ? "k" : "");
  vi.stubEnv("CLOUDINARY_API_SECRET", on ? "s" : "");
};

beforeEach(() => {
  state.delivered = [];
  state.noPhoto = [];
  configure(true);
});
afterEach(() => vi.unstubAllEnvs());

describe("deliver route — proof (N9)", () => {
  it("delivers with a genuine Cloudinary proof, on the rider's own client", async () => {
    const res = await call({ code: "1234", proofUrl: OURS });
    expect(res.status).toBe(200);
    expect(state.delivered).toEqual([{ db: RIDER_DB, id: "asg-1", code: "1234", proofUrl: OURS }]);
    expect(state.noPhoto).toHaveLength(0);
  });

  it("refuses a non-Cloudinary URL before the code is ever checked", async () => {
    const res = await call({ code: "1234", proofUrl: "https://example.com/stock.jpg" });
    expect(res.status).toBe(422);
    expect(state.delivered).toHaveLength(0);
  });

  it("refuses a delivery with no photo and no reason — and does not burn a PIN attempt", async () => {
    const res = await call({ code: "1234" });
    expect(res.status).toBe(422);
    expect((await res.json()).error).toMatch(/ছবি/);
    expect(state.delivered).toHaveLength(0);
  });

  it("accepts no photo + a reason, and records the reason on the order", async () => {
    const res = await call({ code: "1234", noPhotoReason: "camera is broken" });
    expect(res.status).toBe(200);
    expect(state.delivered[0].proofUrl).toBeNull();
    expect(state.noPhoto).toEqual([{ id: "asg-1", reason: "camera is broken" }]);
  });

  it("does not demand a photo while Cloudinary is not configured", async () => {
    configure(false);
    const res = await call({ code: "1234" });
    expect(res.status).toBe(200);
    expect(state.noPhoto).toHaveLength(0);
  });

  it("still requires the 4-digit code", async () => {
    expect((await call({ code: "12", proofUrl: OURS })).status).toBe(422);
  });
});
