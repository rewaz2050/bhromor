/**
 * B6 (2026-09-28) — the holiday reaches the storefront as two dates, or not at all.
 *
 * The columns are nullable and one of them alone means nothing, so the mapper
 * has one job: publish a window only when BOTH ends are there. Half a window
 * would close a shop on a date nobody chose.
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

describe("mapShop — the holiday window", () => {
  it("carries both ends and the shop's own note", () => {
    const shop = mapShop(
      row({
        vacation_start: "2026-10-10",
        vacation_end: "2026-10-12",
        vacation_note: "Closed for Eid",
      }),
    );
    expect(shop.vacation).toEqual({
      start: "2026-10-10",
      end: "2026-10-12",
      note: "Closed for Eid",
    });
  });

  it("publishes no window when only one end is stored — half a holiday closes nothing", () => {
    expect(mapShop(row({ vacation_start: "2026-10-10" })).vacation).toBeUndefined();
    expect(mapShop(row({ vacation_end: "2026-10-12" })).vacation).toBeUndefined();
  });

  it("reads a database without the migration as 'no holiday' — never closed", () => {
    const shop = mapShop(row());
    expect(shop.vacation).toBeUndefined();
  });

  it("survives the public-catalog shape, which is what the storefront renders", () => {
    const shop = toPublicShop(
      mapShop(row({ vacation_start: "2026-10-10", vacation_end: "2026-10-12", vacation_note: "Eid" })),
    );
    expect(shop.vacation).toEqual({ start: "2026-10-10", end: "2026-10-12", note: "Eid" });
  });

  it("keeps the note short — it is shopper-facing copy, not a diary", () => {
    const shop = mapShop(
      row({
        vacation_start: "2026-10-10",
        vacation_end: "2026-10-12",
        vacation_note: "x".repeat(200),
      }),
    );
    expect((shop.vacation?.note ?? "").length).toBeLessThanOrEqual(160);
  });
});
