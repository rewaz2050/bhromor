/**
 * Promo state in the first paint (flicker pass 2026-10-07).
 *
 * These render through `renderToStaticMarkup`, i.e. the SERVER path — the one
 * `useSyncExternalStore` answers with `getServerSnapshot`. Before the pass
 * that snapshot was always "nothing is running", so the server painted no
 * strip and catalog prices, and the client replaced both a beat later: the
 * page jumped down and every price on the grid changed by itself.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import FlashStrip from "@/components/promo/flash-strip";
import CampaignStrip from "@/components/promo/campaign-strip";
import { FlashTimer } from "@/components/promo/flash-timer";
import {
  OFFLINE_CAMPAIGN,
  OFFLINE_PROMOS,
  __resetPromos,
  isPromoSeeded,
  promoNowMs,
  seedPromos,
  type PromoSeed,
} from "@/lib/promo-store";
import { useFlashPrice, usePromos } from "@/lib/use-promos";
import { CAMPAIGN_DEFAULTS, campaignView } from "@/lib/campaign";
import { PROMO_DEFAULTS, countdownLabel, promoView } from "@/lib/promos";
import type { Product } from "@/lib/catalog";

const originalFetch = globalThis.fetch;

/** 7 Oct 2026, mid-day Dhaka — one drop running, 20 % off the whole shop. */
const NOW = Date.UTC(2026, 9, 7, 12, 0, 0);
const FLASH_CFG = {
  ...PROMO_DEFAULTS,
  flash: {
    ...PROMO_DEFAULTS.flash,
    enabled: true,
    title: "Mega Drop",
    discountPct: 20,
    scope: "all" as const,
    // 00:00–23:59 Dhaka — open whichever way the clock maths runs.
    slots: [{ start: "00:00", end: "23:59" }],
  },
};
const CAMPAIGN_CFG = {
  ...CAMPAIGN_DEFAULTS,
  enabled: true,
  title: "Eid Edit",
  startDate: "2026-10-07",
  endDate: "2026-10-10",
};

const RUNNING: PromoSeed = {
  promos: promoView(FLASH_CFG, NOW),
  campaign: campaignView(CAMPAIGN_DEFAULTS, NOW),
  live: true,
};

const product = {
  id: "p1",
  slug: "punjabi",
  name: "Punjabi",
  price: 149000, // ৳1,490
  inStock: true,
  active: true,
  status: "active",
} as unknown as Product;

beforeEach(() => {
  __resetPromos();
  globalThis.fetch = vi.fn(() =>
    Promise.resolve(Response.json({ source: "live", ...RUNNING })),
  ) as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  cleanup();
});

describe("promo seed — the server render", () => {
  it("paints the flash strip while a drop runs, instead of adding it later", () => {
    expect(renderToStaticMarkup(<FlashStrip />)).toBe("");
    seedPromos(RUNNING);
    const html = renderToStaticMarkup(<FlashStrip />);
    expect(html).toContain("Mega Drop");
  });

  it("paints the campaign strip while one is armed", () => {
    const seed: PromoSeed = {
      ...RUNNING,
      campaign: campaignView(CAMPAIGN_CFG, NOW),
    };
    expect(renderToStaticMarkup(<CampaignStrip />)).toBe("");
    seedPromos(seed);
    expect(renderToStaticMarkup(<CampaignStrip />)).toContain("Eid Edit");
  });

  it("quotes the drop price in the HTML, not the catalog price it replaces", () => {
    // Unseeded: the server knows of no drop, so it quotes the catalog price…
    expect(renderToStaticMarkup(<PriceProbe product={product} />)).toContain("৳1,490");
    seedPromos(RUNNING);
    // …and seeded, the price the shopper's browser receives is the drop one.
    // Before this pass both were ৳1,490 and the card silently became ৳1,192.
    expect(renderToStaticMarkup(<PriceProbe product={product} />)).toContain("৳1,192");
  });

  it("freezes the countdown's first frame at the clock the server published", () => {
    const endsAtMs = RUNNING.promos.flash.endsAtMs ?? 0;
    seedPromos(RUNNING);
    expect(promoNowMs()).toBe(NOW);
    // Not "now on this machine" — the shop's own deadline arithmetic, so the
    // server's digits and the client's are the same string.
    expect(renderToStaticMarkup(<FlashTimer endsAtMs={endsAtMs} />)).toContain(
      countdownLabel(Math.max(0, endsAtMs - NOW)),
    );
  });

  it("keeps the offline answer when the seed says nothing is running", () => {
    seedPromos({ promos: OFFLINE_PROMOS, campaign: OFFLINE_CAMPAIGN, live: false });
    expect(isPromoSeeded()).toBe(true);
    expect(renderToStaticMarkup(<FlashStrip />)).toBe("");
  });
});

describe("promo seed — the client", () => {
  it("does not re-ask for what the server already answered", async () => {
    seedPromos(RUNNING);
    const { result } = renderHook(() => usePromos());
    await act(async () => {});
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(result.current.promos.flash.title).toBe("Mega Drop");
  });

  it("still reads on a surface the server did not seed", async () => {
    const { result } = renderHook(() => usePromos());
    await waitFor(() => expect(result.current.promos.flash.enabled).toBe(true));
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });
});

/** Reads the price the way a product card does, inside a server render. */
function PriceProbe({ product: p }: { product: Product }) {
  const { price } = useFlashPrice(p);
  return <span>{`৳${(price / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`}</span>;
}
