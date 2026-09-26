import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { AdminInputError } from "../admin";
import { assertVendorTarget, vendorShopPatch } from "../vendor";

describe("assertVendorTarget (slice 3)", () => {
  it("allows the vendor's early-state moves", () => {
    for (const to of ["confirmed", "preparing", "ready-for-pickup", "cancelled"]) {
      expect(() => assertVendorTarget(to)).not.toThrow();
    }
  });

  it("keeps dispatch states staff-owned", () => {
    for (const to of ["courier-assigned", "out-for-delivery", "delivered", "pending"]) {
      try {
        assertVendorTarget(to);
        expect.unreachable(`${to} should be forbidden`);
      } catch (err) {
        expect(err).toBeInstanceOf(AdminInputError);
        expect((err as AdminInputError).status).toBe(403);
      }
    }
  });
});

describe("vendorShopPatch (slice 3)", () => {
  it("whitelists owner fields and accepts camelCase aliases", () => {
    expect(
      vendorShopPatch(
        {
          name: "  New Name ",
          tagline: "tag",
          logoUrl: "https://x/y.png",
          phone: "01700000000",
          address: "House 1, Road 2",
          prepMinutes: 30,
          isOpen: true,
          status: "active",
          commission_pct: 1,
          zone_ids: ["z1"],
          slug: "hack",
        },
        "owner",
      ),
    ).toEqual({
      name: "New Name",
      tagline: "tag",
      logo_url: "https://x/y.png",
      phone: "01700000000",
      address: "House 1, Road 2",
      prep_minutes: 30,
      is_open: true,
    });
  });

  it("restricts staff to the sign + prep time", () => {
    expect(vendorShopPatch({ is_open: false }, "staff")).toEqual({
      is_open: false,
    });
    expect(vendorShopPatch({ prep_minutes: 20 }, "staff")).toEqual({
      prep_minutes: 20,
    });
    try {
      vendorShopPatch({ is_open: true, name: "sneaky" }, "staff");
      expect.unreachable("staff rename should be forbidden");
    } catch (err) {
      expect(err).toBeInstanceOf(AdminInputError);
      expect((err as AdminInputError).status).toBe(403);
    }
  });

  it("free delivery (2026-09-26): owner sets / clears the shop minimum; staff cannot", () => {
    expect(vendorShopPatch({ free_delivery_min: 99900 }, "owner")).toEqual({ free_delivery_min: 99900 });
    expect(vendorShopPatch({ freeDeliveryMinPaisa: "149900" }, "owner")).toEqual({ free_delivery_min: 149900 });
    // null / "" / 0 switch the shop's rule OFF (explicit write of null)
    expect(vendorShopPatch({ free_delivery_min: null }, "owner")).toEqual({ free_delivery_min: null });
    expect(vendorShopPatch({ free_delivery_min: "" }, "owner")).toEqual({ free_delivery_min: null });
    expect(vendorShopPatch({ free_delivery_min: 0 }, "owner")).toEqual({ free_delivery_min: null });
    // the key is only written when sent — a profile save without it never touches the column
    expect(vendorShopPatch({ name: "Shop One" }, "owner")).toEqual({ name: "Shop One" });
    // garbage is refused, not silently turned off
    expect(() => vendorShopPatch({ free_delivery_min: "abc" }, "owner")).toThrow(/ন্যূনতম/);
    expect(() => vendorShopPatch({ free_delivery_min: -5 }, "owner")).toThrow(/ন্যূনতম/);
    try {
      vendorShopPatch({ free_delivery_min: 99900 }, "staff");
      expect.unreachable("staff must not spend the shop's money");
    } catch (err) {
      expect((err as AdminInputError).status).toBe(403);
    }
  });

  it("bounds prep minutes and the shop name", () => {
    expect(() => vendorShopPatch({ prep_minutes: 241 }, "owner")).toThrow(
      /between 0 and 240/,
    );
    expect(() => vendorShopPatch({ prep_minutes: -1 }, "owner")).toThrow(
      /between 0 and 240/,
    );
    expect(() => vendorShopPatch({ name: "x" }, "owner")).toThrow(/too short/);
  });

  it("rejects a bad phone number and a stub address", () => {
    expect(() => vendorShopPatch({ phone: "01700" }, "owner")).toThrow(
      /সঠিক ফোন/,
    );
    expect(() => vendorShopPatch({ phone: "not-a-number" }, "owner")).toThrow(
      /সঠিক ফোন/,
    );
    expect(() => vendorShopPatch({ address: "road" }, "owner")).toThrow(
      /ঠিকানা/,
    );
  });

  it("returns an empty patch when nothing was sent", () => {
    expect(vendorShopPatch({}, "owner")).toEqual({});
  });
});
