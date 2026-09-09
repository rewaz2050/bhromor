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
          phone: "01700",
          address: "road",
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
      phone: "01700",
      address: "road",
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

  it("bounds prep minutes and the shop name", () => {
    expect(() => vendorShopPatch({ prep_minutes: 241 }, "owner")).toThrow(
      /between 0 and 240/,
    );
    expect(() => vendorShopPatch({ prep_minutes: -1 }, "owner")).toThrow(
      /between 0 and 240/,
    );
    expect(() => vendorShopPatch({ name: "x" }, "owner")).toThrow(/too short/);
  });

  it("returns an empty patch when nothing was sent", () => {
    expect(vendorShopPatch({}, "owner")).toEqual({});
  });
});
