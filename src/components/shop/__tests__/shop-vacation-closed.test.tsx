/**
 * B6 (2026-09-28) — what a shopper meets when the shop is away.
 *
 * The directory card is the promise made visible: a shop on holiday does not
 * just say "closed", it says when it takes orders again. The date is the same
 * in both languages, so it is what these tests read.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import ShopCard from "@/components/shop/shop-card";
import ShopHero from "@/components/shop/shop-hero";
import type { Shop } from "@/lib/catalog";

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

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

describe("ShopHero — the shop's own reason", () => {
  it("prints the note the shop wrote, next to the date it is back", () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(Date.parse("2026-10-11T12:00:00Z"));
    render(
      <ShopHero shop={shop({ vacation: { start: "2026-10-10", end: "2026-10-12", note: "Closed for Eid" } })} zoneNames={[]} />,
    );
    expect(screen.getByTestId("shop-holiday-note")).toHaveTextContent("Closed for Eid");
    expect(screen.getByTestId("shop-open-state")).toHaveTextContent("13 Oct");
  });

  it("prints no note when the shop is not away — a reason needs a closure", () => {
    render(
      <ShopHero shop={shop({ isOpen: false, vacation: { start: "2026-10-10", end: "2026-10-12", note: "Closed for Eid" } })} zoneNames={[]} />,
    );
    expect(screen.queryByTestId("shop-holiday-note")).toBeNull();
  });
});

describe("ShopCard — a shop on holiday", () => {
  it("names the day the shop is back, not just 'closed'", () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(Date.parse("2026-10-11T12:00:00Z"));
    render(
      <ShopCard
        shop={shop({ vacation: { start: "2026-10-10", end: "2026-10-12", note: "Eid" } })}
        productCount={3}
        zoneName="Sunamganj Sadar"
        servesZone
      />,
    );
    const pill = screen.getByTestId("shop-open-state");
    expect(pill).toHaveTextContent("13 Oct");
    expect(pill.textContent ?? "").not.toMatch(/^\s*closed\s*$/i);
  });

  it("shows a shop that closed itself for the day as plainly closed", () => {
    render(
      <ShopCard
        shop={shop({ isOpen: false })}
        productCount={3}
        zoneName="Sunamganj Sadar"
        servesZone
      />,
    );
    const pill = screen.getByTestId("shop-open-state");
    expect(pill.textContent ?? "").not.toContain("13 Oct");
  });

  it("says nothing about a holiday that has not started yet", () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(Date.parse("2026-09-28T12:00:00Z"));
    render(
      <ShopCard
        shop={shop({ vacation: { start: "2026-10-10", end: "2026-10-12" } })}
        productCount={3}
        zoneName="Sunamganj Sadar"
        servesZone
      />,
    );
    // The shop is open today — a booking for October is not a closure now.
    expect(screen.getByTestId("shop-open-state").textContent ?? "").not.toContain("Oct");
  });
});
