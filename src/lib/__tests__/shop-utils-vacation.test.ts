/**
 * B6 (2026-09-28) — a holiday closes the shop without hiding why.
 *
 * `isShopOrderable` is the one gate the bag, the checkout and the PDP all ask,
 * so this pins the three cases that decide whether a tap becomes an order:
 * an open shop stays open, a shop inside its window is closed, and a shop whose
 * window has PASSED is open again with nobody touching a switch.
 */
import { describe, expect, it } from "vitest";
import { isShopOrderable, shopClosedCopy } from "@/lib/shop-utils";
import type { Shop } from "@/lib/catalog";

const shop = (over: Partial<Shop> = {}): Shop => ({
  id: "s1",
  slug: "sitara",
  name: "Sitara Boutique",
  tagline: "",
  logoUrl: "",
  coverUrl: "",
  phone: "01711111111",
  address: "",
  zoneIds: [],
  prepMinutes: 15,
  commissionPct: 15,
  status: "active",
  isOpen: true,
  ratingAvg: 4.5,
  ratingCount: 12,
  ...over,
});

const NOW = Date.parse("2026-10-11T12:00:00Z"); // inside 10–12 Oct
const t = (key: string): string =>
  ({
    "shops.closed": "Closed",
    "shops.onHoliday": "On holiday — back {date}",
    "shops.onHolidayDays": "On holiday — back {date} ({n} days)",
    "shops.onHolidayTomorrow": "On holiday — back tomorrow ({date})",
  })[key] ?? key;

describe("isShopOrderable — a booked holiday", () => {
  it("closes the shop for the whole window, both ends included", () => {
    const away = shop({ vacation: { start: "2026-10-10", end: "2026-10-12" } });
    expect(isShopOrderable(away, Date.parse("2026-10-10T00:00:00Z"))).toBe(false);
    expect(isShopOrderable(away, NOW)).toBe(false);
    expect(isShopOrderable(away, Date.parse("2026-10-12T23:59:00Z"))).toBe(false);
  });

  it("opens the shop again the day after, on its own", () => {
    const away = shop({ vacation: { start: "2026-10-10", end: "2026-10-12" } });
    expect(isShopOrderable(away, Date.parse("2026-10-13T00:00:01Z"))).toBe(true);
  });

  it("leaves a shop that booked nothing alone", () => {
    expect(isShopOrderable(shop(), NOW)).toBe(true);
    expect(isShopOrderable(shop({ vacation: { start: "", end: "" } }), NOW)).toBe(true);
  });

  it("still refuses a shop that closed itself, holiday or not", () => {
    expect(isShopOrderable(shop({ isOpen: false }), NOW)).toBe(false);
    expect(isShopOrderable(shop({ isOpen: false, vacation: { start: "2026-10-20", end: "2026-10-22" } }), NOW)).toBe(
      false,
    );
  });

  it("refuses a suspended shop even outside its holiday", () => {
    const suspended = shop({ status: "suspended", vacation: { start: "2026-10-10", end: "2026-10-12" } });
    expect(isShopOrderable(suspended, NOW)).toBe(false);
    // …and after the holiday, the suspension still stands on its own.
    expect(isShopOrderable(suspended, Date.parse("2026-10-20T00:00:00Z"))).toBe(false);
  });
});

describe("shopClosedCopy — what the shopper is told", () => {
  it("names the day the shop takes orders again", () => {
    const away = shop({ vacation: { start: "2026-10-10", end: "2026-10-12" } });
    expect(shopClosedCopy(away, t, NOW)).toEqual({
      text: "On holiday — back tomorrow (13 Oct)",
      holiday: true,
    });
  });

  it("counts more than one day in plain words", () => {
    const away = shop({ vacation: { start: "2026-10-10", end: "2026-10-20" } });
    expect(shopClosedCopy(away, t, Date.parse("2026-10-10T00:00:00Z"))).toEqual({
      text: "On holiday — back 21 Oct (10 days)",
      holiday: true,
    });
  });

  it("is just 'closed' when the shop is not on holiday", () => {
    expect(shopClosedCopy(shop({ isOpen: false }), t, NOW)).toEqual({
      text: "Closed",
      holiday: false,
    });
    expect(shopClosedCopy(shop(), t, NOW)).toEqual({ text: "Closed", holiday: false });
  });

  it("never shows a holiday that is still in the future as a closure today", () => {
    const booked = shop({ vacation: { start: "2026-10-20", end: "2026-10-22" } });
    expect(shopClosedCopy(booked, t, NOW)).toEqual({ text: "Closed", holiday: false });
  });
});
