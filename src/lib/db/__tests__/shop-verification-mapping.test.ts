/**
 * B5 (2026-09-28) — the badge travels to the storefront; the paperwork does not.
 *
 * Staff's private note and the officer's e-mail live in the same row as the
 * badge. A mapper that spreads the whole row would publish them. This pins the
 * boundary: `mapShop` (which feeds the public catalog AND the vendor's own
 * payload) carries only the two booleans and the date.
 */
import { describe, expect, it } from "vitest";
import { mapShop } from "@/lib/db/mappers";
import { toPublicShop } from "@/lib/shop-utils";
import type { DbShop } from "@/lib/db/types";

const row = (over: Partial<DbShop> = {}): DbShop => ({
  id: "s1",
  slug: "sitara",
  name: "Sitara Boutique",
  tagline: "",
  logo_url: "",
  phone: "01711111111",
  contact_email: "owner@example.com",
  address: "",
  zone_ids: [],
  prep_minutes: 15,
  commission_pct: 15,
  status: "active",
  is_open: true,
  rating_avg: 4.5,
  rating_count: 12,
  created_at: "2026-09-01T00:00:00.000Z",
  ...over,
});

describe("mapShop — the badge, without the paperwork", () => {
  it("carries the two checks and the date", () => {
    const shop = mapShop(
      row({
        nid_checked: true,
        trade_licence_checked: true,
        verified_at: "2026-09-28T12:00:00.000Z",
      }),
    );
    expect(shop.verification).toEqual({
      nid: true,
      tradeLicence: true,
      verifiedAt: Date.parse("2026-09-28T12:00:00.000Z"),
    });
  });

  it("never puts the note, the officer or the officer's e-mail on the Shop", () => {
    const shop = mapShop(
      row({
        nid_checked: true,
        trade_licence_checked: true,
        verified_at: "2026-09-28T12:00:00.000Z",
        verified_by: "u1",
        verified_by_email: "staff@prosanti.example",
        verification_note: "NID 1234, licence expired",
      }),
    );
    const serialized = JSON.stringify(shop);
    expect(serialized).not.toContain("staff@prosanti.example");
    expect(serialized).not.toContain("NID 1234");
    expect(serialized).not.toContain("verified_by");
  });

  it("reads a database without the migration as 'nothing checked' — not verified", () => {
    const shop = mapShop(row());
    expect(shop.verification).toEqual({ nid: false, tradeLicence: false });
  });

  it("survives the public strip (contact e-mail and review still go)", () => {
    const shop = toPublicShop(
      mapShop(row({ nid_checked: true, trade_licence_checked: true, verified_at: "2026-09-28T12:00:00.000Z" })),
    );
    expect(shop.contactEmail).toBeUndefined();
    expect(shop.verification?.nid).toBe(true);
  });
});
