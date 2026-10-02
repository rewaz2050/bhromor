import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { AdminInputError, upsertShop, verifyPaymentAsStaff } from "../admin";
import { verifyPaymentAsVendor } from "../vendor";
import { shopPaymentVerifier } from "../payment-verifier";
import { mapShop } from "../mappers";

/**
 * A minimal fake of the Supabase client for verifyPaymentAsStaff:
 * the order lookup always succeeds; the RPC fails with the given message
 * (Postgres errors surface as { error: { message } }).
 */
const fakeDb = (rpcMessage: string) =>
  ({
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: { id: "order-uuid" }, error: null }),
        }),
      }),
    }),
    rpc: async () => ({
      error: { message: rpcMessage },
    }),
  }) as never;

describe("verifyPaymentAsStaff error mapping (P1 #8)", () => {
  it("maps 'order already cancelled' to 422 with a human sentence", async () => {
    await expect(
      verifyPaymentAsStaff(fakeDb("order already cancelled"), "PS-1", "verified"),
    ).rejects.toMatchObject({
      status: 422,
      message: expect.stringMatching(/cancelled/i),
    });
  });

  it("maps 'payment already decided' to 409", async () => {
    await expect(
      verifyPaymentAsStaff(
        fakeDb("payment already decided"),
        "PS-1",
        "rejected",
      ),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("maps 'not a wallet payment' to 422", async () => {
    await expect(
      verifyPaymentAsStaff(fakeDb("not a wallet payment"), "PS-1", "verified"),
    ).rejects.toMatchObject({ status: 422 });
  });

  it("maps 'forbidden' to 403", async () => {
    await expect(
      verifyPaymentAsStaff(fakeDb("forbidden"), "PS-1", "verified"),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("wraps unknown RPC failures as 422", async () => {
    await expect(
      verifyPaymentAsStaff(fakeDb("some surprise"), "PS-1", "verified"),
    ).rejects.toBeInstanceOf(AdminInputError);
  });
});

describe("who verifies a wallet payment (audit N6, 202610010002)", () => {
  it("staff blocked by a shop-only setting get a 409 that says how to step in", async () => {
    await expect(
      verifyPaymentAsStaff(fakeDb("payment verification delegated to the shop"), "PS-1", "verified"),
    ).rejects.toMatchObject({ status: 409, message: expect.stringMatching(/verifies its own[\s\S]*Admin → Shops/) });
  });

  it("a shop blocked by a platform-only setting gets a 403 that says staff handle it", async () => {
    const vendorDb = (rpcMessage: string) =>
      ({
        from: () => ({
          select: () => ({
            eq: () => ({
              eq: () => ({ single: async () => ({ data: { id: "order-uuid" }, error: null }) }),
            }),
          }),
        }),
        rpc: async () => ({ error: { message: rpcMessage } }),
      }) as never;
    await expect(
      verifyPaymentAsVendor(vendorDb("payment verification reserved for the platform"), "shop-1", "PS-1", "verified"),
    ).rejects.toMatchObject({ status: 403, message: expect.stringMatching(/PROSANTI staff verify/) });
  });

  const shopsDb = (result: { data: unknown; error: unknown }) =>
    ({
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => result }) }) }),
    }) as never;

  it("reads the shop's setting, and treats a missing column / shop / junk as 'both'", async () => {
    expect(await shopPaymentVerifier(shopsDb({ data: { payment_verifier: "shop" }, error: null }), "s1")).toBe("shop");
    expect(await shopPaymentVerifier(shopsDb({ data: { payment_verifier: "platform" }, error: null }), "s1")).toBe("platform");
    expect(await shopPaymentVerifier(shopsDb({ data: null, error: { code: "42703" } }), "s1")).toBe("both");
    expect(await shopPaymentVerifier(shopsDb({ data: { payment_verifier: "weird" }, error: null }), "s1")).toBe("both");
    expect(await shopPaymentVerifier(shopsDb({ data: null, error: null }), null)).toBe("both");
  });

  it("mapShop exposes the setting only when the column exists", () => {
    const row = { id: "s", slug: "s", name: "S", phone: "", zone_ids: [], prep_minutes: 1, commission_pct: 10, status: "active", is_open: true, rating_avg: 0, rating_count: 0, created_at: "2026-10-01" } as never;
    expect("paymentVerifier" in mapShop(row)).toBe(false);
    expect(mapShop({ ...(row as object), payment_verifier: "shop" } as never).paymentVerifier).toBe("shop");
  });

  it("mapShop exposes how the shop is paid only when the column exists (202610020013)", () => {
    const row = { id: "s", slug: "s", name: "S", phone: "", zone_ids: [], prep_minutes: 1, commission_pct: 10, status: "active", is_open: true, rating_avg: 0, rating_count: 0, created_at: "2026-10-01" } as never;
    expect("settlementModel" in mapShop(row)).toBe(false);
    const own = mapShop({ ...(row as object), settlement_model: "shop_wallet", wallet_bkash: "01811111111", wallet_nagad: "junk" } as never);
    expect(own.settlementModel).toBe("shop_wallet");
    expect(own.shopWallets).toEqual({ bkash: "01811111111" });
    expect(mapShop({ ...(row as object), settlement_model: "weird" } as never).settlementModel).toBe("platform");
  });

  it("upsertShop refuses a shop_wallet shop with no number before touching the database", async () => {
    const db = { from: () => { throw new Error("must not be reached"); } } as never;
    await expect(
      upsertShop(db, { name: "Test Shop", settlementModel: "shop_wallet" }),
    ).rejects.toMatchObject({ message: expect.stringMatching(/bKash or Nagad number first/) });
  });

  it("upsertShop refuses an unknown verifier before touching the database", async () => {
    const db = { from: () => { throw new Error("must not be reached"); } } as never;
    await expect(
      upsertShop(db, { name: "Test Shop", paymentVerifier: "nobody" }),
    ).rejects.toMatchObject({ message: expect.stringMatching(/platform, shop or both/) });
  });
});
