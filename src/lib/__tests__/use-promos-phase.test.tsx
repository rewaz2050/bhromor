import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Profiler } from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { PRODUCTS } from "@/lib/catalog";
import { __resetPromos, ensurePromos, useFlashPrice, usePromos } from "@/lib/use-promos";

/**
 * Scroll audit 2026-09-27 — the promo store must not tick every component
 * that quotes a price once a second. A listing of 60 cards used to re-render
 * 60 times a minute while the shopper scrolled; now a card re-renders when
 * the backend view changes or a window opens/closes, and not otherwise.
 */

const product = PRODUCTS.find((p) => p.inStock && !p.compareAtPrice)!;

/** 2026-09-27 18:00:00 Asia/Dhaka (12:00 UTC) — the clock every test starts at. */
const NOW = Date.UTC(2026, 8, 27, 12, 0, 0);

const stubPromoApi = (slot: { start: string; end: string }) => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            source: "live",
            promos: {
              flash: {
                enabled: true,
                title: "Flash Drop",
                discountPct: 25,
                slots: [slot],
                scope: "all",
                productIds: [],
                maxDiscountPaisa: 50_000,
                active: false,
                msLeft: 0,
                endsAtMs: null,
                nextStartsAtMs: null,
                progress: 0,
                asOf: NOW,
              },
              bundle: { enabled: false, name: "", discountPct: 0, maxItems: 0 },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    ),
  );
};

/* Render counters via <Profiler> — counted from its onRender callback, so
   the probes themselves stay pure. */
const counts = { price: 0, strip: 0 };
function PriceCard() {
  const flash = useFlashPrice(product);
  return <output data-testid="price">{flash.was === null ? "list" : `flash:${flash.price}`}</output>;
}
function PriceProbe() {
  return (
    <Profiler id="price" onRender={() => void (counts.price += 1)}>
      <PriceCard />
    </Profiler>
  );
}
function Strip() {
  const { flash } = usePromos();
  return <output data-testid="strip">{flash.active ? "live" : "off"}</output>;
}
function StripProbe() {
  return (
    <Profiler id="strip" onRender={() => void (counts.strip += 1)}>
      <Strip />
    </Profiler>
  );
}

const mountAndLoad = async (ui: React.ReactElement) => {
  const view = render(ui);
  // The components schedule the same fetch after first paint; awaiting the
  // shared loader here makes the view (and the phase) settle deterministically.
  await act(async () => {
    await ensurePromos();
  });
  return view;
};

beforeEach(() => {
  counts.price = 0;
  counts.strip = 0;
  __resetPromos();
  vi.useFakeTimers({
    now: NOW,
    toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"],
  });
});

afterEach(() => {
  cleanup();
  __resetPromos();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("Promo store — flash phase, not a clock", () => {
  it("does not re-render a price while the clock ticks and nothing changes", async () => {
    // Window opens at 18:02 — nothing should move for the next 90 s.
    stubPromoApi({ start: "18:02", end: "19:00" });
    await mountAndLoad(<PriceProbe />);
    expect(screen.getByTestId("price")).toHaveTextContent("list");
    const settled = counts.price;

    await act(async () => {
      vi.advanceTimersByTime(90_000);
    });
    expect(counts.price).toBe(settled);
    expect(screen.getByTestId("price")).toHaveTextContent("list");
  });

  it("re-renders once when the window opens, and every subscriber sees the same phase", async () => {
    stubPromoApi({ start: "18:02", end: "19:00" });
    await mountAndLoad(
      <>
        <PriceProbe />
        <StripProbe />
      </>,
    );
    expect(screen.getByTestId("price")).toHaveTextContent("list");
    expect(screen.getByTestId("strip")).toHaveTextContent("off");
    const before = counts.price;
    const stripBefore = counts.strip;

    // 18:02:01 — the once-a-second phase check crosses the opening.
    await act(async () => {
      vi.advanceTimersByTime(121_000);
    });
    expect(screen.getByTestId("strip")).toHaveTextContent("live");
    expect(screen.getByTestId("price")).toHaveTextContent(/^flash:/);
    // One phase change → one re-render each, not one per elapsed second.
    expect(counts.price - before).toBe(1);
    expect(counts.strip - stripBefore).toBe(1);

    // …and the price goes back at 19:00, again with a single render.
    const live = counts.price;
    await act(async () => {
      vi.advanceTimersByTime(58 * 60_000 + 1_000);
    });
    expect(screen.getByTestId("price")).toHaveTextContent("list");
    expect(counts.price - live).toBe(1);
  });

  it("stops its timer once nothing is subscribed", async () => {
    stubPromoApi({ start: "18:30", end: "19:00" });
    const { unmount } = await mountAndLoad(<PriceProbe />);
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    const clear = vi.spyOn(globalThis, "clearInterval");
    unmount();
    // The last subscriber leaving tears the 1 s phase interval down.
    expect(clear).toHaveBeenCalled();
    clear.mockRestore();
    // A fresh subscriber starts it again and reads a correct phase at once.
    const set = vi.spyOn(globalThis, "setInterval");
    await mountAndLoad(<PriceProbe />);
    expect(set.mock.calls.filter((call) => call[1] === 1000)).toHaveLength(1);
    set.mockRestore();
  });
});
