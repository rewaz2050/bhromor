/**
 * Apply = sign up (2026-09-26): the login exists from the application on,
 * so the dashboards' gates must tell a pending applicant to wait — with a
 * machine-readable `reason` for the login pages — instead of the generic
 * "not active, contact support" that suspended accounts get.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const state = vi.hoisted(() => ({
  user: { id: "u-1", email: "shop@example.com" } as { id: string; email: string } | null,
  rows: {} as Record<string, unknown>,
}));

vi.mock("../supabase-server", () => ({
  getSupabaseServer: async () => ({
    auth: { getUser: async () => ({ data: { user: state.user }, error: null }) },
    from: (table: string) => {
      const builder: Record<string, unknown> = {};
      for (const op of ["select", "eq"]) builder[op] = () => builder;
      builder.single = async () => {
        const row = state.rows[table];
        return row ? { data: row, error: null } : { data: null, error: { message: "0 rows" } };
      };
      return builder;
    },
  }),
  getSupabaseService: () => ({ service: true }),
}));

import { VendorAuthError, requireVendor } from "../vendor-auth";
import { RiderAuthError, requireRider } from "../rider-auth";

const riderRow = (status: string) => ({
  id: "rider-1",
  user_id: "u-1",
  name: "Tanvir",
  phone: "01811111111",
  contact_email: "rider@example.com",
  vehicle: "bike",
  zone_ids: [],
  status,
  is_online: false,
  cash_in_hand: 0,
  rating_avg: 0,
  rating_count: 0,
  created_at: "2026-09-26T00:00:00.000Z",
});

beforeEach(() => {
  state.user = { id: "u-1", email: "shop@example.com" };
  state.rows = {};
});

describe("requireVendor after apply = sign up", () => {
  it("refuses a pending shop with reason 'pending'", async () => {
    state.rows = { vendor_users: { shop_id: "shop-1", role: "owner" }, shops: { status: "pending" } };
    const err = await requireVendor().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(VendorAuthError);
    expect(err as VendorAuthError).toMatchObject({ status: 403, reason: "pending" });
    expect((err as VendorAuthError).message).toMatch(/awaiting/i);
  });

  it("refuses a suspended shop with reason 'suspended'", async () => {
    state.rows = { vendor_users: { shop_id: "shop-1", role: "owner" }, shops: { status: "suspended" } };
    await expect(requireVendor()).rejects.toMatchObject({ status: 403, reason: "suspended" });
  });

  it("refuses a login without a shop with reason 'none'", async () => {
    await expect(requireVendor()).rejects.toMatchObject({ status: 403, reason: "none" });
  });

  it("opens the dashboard once staff approved the shop", async () => {
    state.rows = { vendor_users: { shop_id: "shop-1", role: "owner" }, shops: { status: "active" } };
    await expect(requireVendor()).resolves.toMatchObject({ shopId: "shop-1", role: "owner" });
  });

  it("refuses a rejected shop with reason 'rejected' and the staff note (round 4)", async () => {
    state.rows = {
      vendor_users: { shop_id: "shop-1", role: "owner" },
      shops: { status: "rejected", review_note: "The phone number never answers." },
    };
    const err = await requireVendor().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(VendorAuthError);
    expect(err as VendorAuthError).toMatchObject({ status: 403, reason: "rejected" });
    expect((err as VendorAuthError).message).toMatch(/Reason: The phone number never answers\./);
    expect((err as VendorAuthError).message).toMatch(/apply again/i);
  });

  it("gives a rejected shop without a note a generic next step", async () => {
    state.rows = { vendor_users: { shop_id: "shop-1", role: "owner" }, shops: { status: "rejected", review_note: null } };
    const err = (await requireVendor().catch((e: unknown) => e)) as VendorAuthError;
    expect(err.reason).toBe("rejected");
    expect(err.message).not.toMatch(/Reason:/);
  });
});

describe("requireRider after apply = sign up", () => {
  it("refuses a pending rider with reason 'pending' in Bangla", async () => {
    state.rows = { riders: riderRow("pending") };
    const err = await requireRider().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RiderAuthError);
    expect(err as RiderAuthError).toMatchObject({ status: 403, reason: "pending" });
    expect((err as RiderAuthError).message).toMatch(/অনুমোদনের অপেক্ষায়/);
  });

  it("refuses a suspended rider with reason 'suspended'", async () => {
    state.rows = { riders: riderRow("suspended") };
    await expect(requireRider()).rejects.toMatchObject({ status: 403, reason: "suspended" });
  });

  it("refuses a login without a rider row with reason 'none'", async () => {
    await expect(requireRider()).rejects.toMatchObject({ status: 403, reason: "none" });
  });

  it("opens the rider app once staff approved the rider", async () => {
    state.rows = { riders: riderRow("active") };
    const ctx = await requireRider();
    expect(ctx.rider.status).toBe("active");
    expect(ctx.rider.hasLogin).toBe(true);
  });

  it("refuses a rejected rider with reason 'rejected' and the note in Bangla (round 4)", async () => {
    state.rows = { riders: { ...riderRow("rejected"), review_note: "NID photo is blurry" } };
    const err = (await requireRider().catch((e: unknown) => e)) as RiderAuthError;
    expect(err).toBeInstanceOf(RiderAuthError);
    expect(err).toMatchObject({ status: 403, reason: "rejected" });
    expect(err.message).toMatch(/NID photo is blurry/);
    expect(err.message).toMatch(/আবার আবেদন/);
  });

  it("lets a pending or rejected applicant through the KYC gate only (round 4)", async () => {
    state.rows = { riders: riderRow("pending") };
    await expect(requireRider({ allowApplicant: true })).resolves.toMatchObject({
      rider: { status: "pending" },
    });
    state.rows = { riders: riderRow("rejected") };
    await expect(requireRider({ allowApplicant: true })).resolves.toMatchObject({
      rider: { status: "rejected" },
    });
    // Suspended riders stay out even of the KYC routes.
    state.rows = { riders: riderRow("suspended") };
    await expect(requireRider({ allowApplicant: true })).rejects.toMatchObject({ reason: "suspended" });
  });

  it("maps the review trail and KYC columns onto the rider (round 4)", async () => {
    state.rows = {
      riders: {
        ...riderRow("active"),
        reviewed_by_email: "admin@prosanti.example",
        reviewed_at: "2026-09-26T09:00:00.000Z",
        kyc: { nid_front: "https://res.cloudinary.com/demo/image/upload/v1/a.jpg", bogus: "http://x" },
        kyc_submitted_at: null,
      },
    };
    const ctx = await requireRider();
    expect(ctx.rider.review).toEqual({ note: undefined, by: "admin@prosanti.example", at: Date.parse("2026-09-26T09:00:00.000Z") });
    expect(ctx.rider.kyc).toEqual({ nid_front: "https://res.cloudinary.com/demo/image/upload/v1/a.jpg" });
    expect(ctx.rider.kycSubmittedAt).toBeUndefined();
  });
});
