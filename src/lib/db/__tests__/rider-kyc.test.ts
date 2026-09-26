/**
 * Round 4 (2026-09-26) — rider KYC persistence: only Cloudinary URLs for
 * known documents are stored, the first complete set stamps
 * kyc_submitted_at, and a database without the migration says so.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("../../env", () => ({ cloudinaryCloudName: () => "demo" }));

const state = vi.hoisted(() => ({
  row: { kyc: {} as Record<string, unknown>, kyc_submitted_at: null as string | null },
  updates: [] as Record<string, unknown>[],
  readError: null as { code?: string; message: string } | null,
}));

const db = {
  from: () => ({
    select: () => ({
      eq: () => ({
        single: async () => ({ data: state.readError ? null : state.row, error: state.readError }),
      }),
    }),
    update: (patch: Record<string, unknown>) => {
      state.updates.push(patch);
      const next = {
        kyc: (patch.kyc as Record<string, unknown>) ?? state.row.kyc,
        kyc_submitted_at: (patch.kyc_submitted_at as string | undefined) ?? state.row.kyc_submitted_at,
      };
      state.row = next;
      return { eq: () => ({ select: () => ({ single: async () => ({ data: next, error: null }) }) }) };
    },
  }),
};

import { getRiderKyc, saveRiderKycDoc } from "../rider-kyc";
import type { Rider } from "../../catalog";

const rider = { id: "rider-1", vehicle: "bicycle" } as Rider;
const url = (n: string) => `https://res.cloudinary.com/demo/image/upload/v1/prosanti/rider-kyc/${n}.jpg`;

beforeEach(() => {
  state.row = { kyc: {}, kyc_submitted_at: null };
  state.updates = [];
  state.readError = null;
});

describe("saveRiderKycDoc", () => {
  it("stores one document and reports progress", async () => {
    const out = await saveRiderKycDoc(db as never, rider, { doc: "nid_front", url: url("front") });
    expect(state.updates[0]).toEqual({ kyc: { nid_front: url("front") } });
    expect(out).toMatchObject({ complete: false, missing: ["nid_back", "selfie"], submittedAt: null });
  });

  it("stamps kyc_submitted_at exactly once, when the required set is complete", async () => {
    state.row = { kyc: { nid_front: url("f"), nid_back: url("b") }, kyc_submitted_at: null };
    const out = await saveRiderKycDoc(db as never, rider, { doc: "selfie", url: url("s") });
    expect(typeof state.updates[0].kyc_submitted_at).toBe("string");
    expect(out.complete).toBe(true);
    expect(out.submittedAt).not.toBeNull();
    // Replacing a photo later keeps the original submission time.
    await saveRiderKycDoc(db as never, rider, { doc: "selfie", url: url("s2") });
    expect(state.updates[1]).not.toHaveProperty("kyc_submitted_at");
  });

  it("refuses unknown documents and foreign URLs", async () => {
    await expect(saveRiderKycDoc(db as never, rider, { doc: "passport", url: url("p") })).rejects.toMatchObject({ status: 422 });
    await expect(saveRiderKycDoc(db as never, rider, { doc: "selfie", url: "https://evil.example/a.jpg" })).rejects.toMatchObject({ status: 422 });
    await expect(
      saveRiderKycDoc(db as never, rider, { doc: "selfie", url: "https://res.cloudinary.com/other/image/upload/v1/a.jpg" }),
    ).rejects.toMatchObject({ status: 422 });
    expect(state.updates).toEqual([]);
  });

  it("explains a database that has not run the migration (503, Bangla)", async () => {
    state.readError = { code: "42703", message: 'column riders.kyc does not exist' };
    const err = (await getRiderKyc(db as never, rider).catch((e: unknown) => e)) as { status: number; message: string };
    expect(err.status).toBe(503);
    expect(err.message).toMatch(/আবেদন ঠিকই জমা আছে/);
  });
});
