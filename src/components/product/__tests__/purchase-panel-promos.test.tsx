import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import PurchasePanel from "@/components/product/purchase-panel";
import { CartProvider } from "@/components/cart/cart-provider";
import { LanguageProvider } from "@/components/i18n/language-provider";
import { PRODUCTS } from "@/lib/catalog";
import { formatBdt } from "@/lib/format";
import { SIZE_PROFILE_KEY, __resetSizeProfile } from "@/lib/size-finder";
import { PRICE_SNAPSHOT_KEY, __resetPriceWatch } from "@/lib/price-drop";
import { __resetPromos } from "@/lib/use-promos";

/**
 * The P0 surfaces on the buy box: the flash quote, the size this body wears,
 * and the "it got cheaper since you looked" line.
 *
 * The promo store is NOT mocked — `useFlashPrice` has to come through the same
 * `/api/promo` → `flashState` → `effectiveUnitPrice` path the storefront uses,
 * otherwise the test proves nothing about a badge agreeing with the money.
 */

vi.mock("@/lib/use-live-catalog", async () => {
  const { CATEGORIES, PRODUCTS } = await import("@/lib/catalog");
  return {
    useLiveCatalog: () => ({
      products: PRODUCTS,
      categories: CATEGORIES,
      shops: [],
      live: false,
      loading: false,
      liveCategories: CATEGORIES,
    }),
  };
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

const pad = (n: number) => String(n).padStart(2, "0");

/** A drop window that is open right now in Asia/Dhaka (−30min → +60min). */
const openWindow = (): { start: string; end: string } => {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dhaka",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0") % 24;
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  const clock = (m: number) => {
    const value = ((m % 1440) + 1440) % 1440;
    return `${pad(Math.floor(value / 60))}:${pad(value % 60)}`;
  };
  return { start: clock(hour * 60 + minute - 30), end: clock(hour * 60 + minute + 60) };
};

const stubPromoApi = (active: boolean) => {
  const now = Date.now();
  const view = {
    source: "live",
    promos: {
      flash: {
        enabled: active,
        title: "Flash Drop",
        discountPct: 25,
        slots: [openWindow()],
        scope: "all",
        productIds: [],
        maxDiscountPaisa: 50_000,
        active,
        msLeft: active ? 3_600_000 : 0,
        endsAtMs: active ? now + 3_600_000 : null,
        nextStartsAtMs: active ? null : now + 7_200_000,
        progress: active ? 0.4 : 0,
        asOf: now,
      },
      bundle: { enabled: true, name: "Eid Set", discountPct: 10, maxItems: 4 },
    },
  };
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL) =>
      Promise.resolve(
        new Response(JSON.stringify(String(input).includes("/api/promo") ? view : {}), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    ),
  );
};

const product = PRODUCTS.find(
  (p) => p.sizes.length > 1 && p.inStock && !p.compareAtPrice,
)!;
const flashPrice = product.price - Math.min(Math.floor(product.price * 0.25), 50_000);

const renderPanel = () =>
  render(
    <LanguageProvider>
      <CartProvider>
        <PurchasePanel product={product} />
      </CartProvider>
    </LanguageProvider>,
  );

beforeEach(() => {
  localStorage.clear();
  // These stores cache the device state at module scope — drop the cache so
  // each test reads what it just wrote to localStorage.
  __resetPromos();
  __resetSizeProfile();
  __resetPriceWatch();
  stubPromoApi(true);
});

afterEach(() => {
  cleanup();
  __resetPromos();
  __resetSizeProfile();
  __resetPriceWatch();
  vi.unstubAllGlobals();
});

describe("Buy box — flash quote", () => {
  it("shows the flash price, the percent and the countdown line while a window runs", async () => {
    renderPanel();
    await waitFor(() => {
      expect(screen.getAllByText(formatBdt(flashPrice)).length).toBeGreaterThan(0);
    });
    expect(screen.getByText("25% off")).toBeInTheDocument();
    expect(screen.getByText(/Flash price applied at checkout/)).toBeInTheDocument();
    // The list price stays visible — anchoring, not a hidden markup.
    // The list price stays on screen, in words — anchoring, not a hidden markup.
    expect(screen.getByText(/Was \u09f3/)).toBeInTheDocument();
  });

  it("quotes the plain catalog price when nothing is running", async () => {
    stubPromoApi(false);
    __resetPromos();
    renderPanel();
    await waitFor(() => {
      expect(screen.getAllByText(formatBdt(product.price)).length).toBeGreaterThan(0);
    });
    expect(screen.queryByText(/Flash price applied at checkout/)).not.toBeInTheDocument();
  });
});

describe("Buy box — size finder", () => {
  it("pre-selects the recommended size and labels every option with its fit", async () => {
    stubPromoApi(false);
    __resetPromos();
    localStorage.setItem(
      SIZE_PROFILE_KEY,
      JSON.stringify({ heightCm: 170, weightKg: 70, fit: "regular" }),
    );
    renderPanel();

    const line = await screen.findByText(/Best for you:/);
    expect(line).toBeInTheDocument();

    const sizeButtons = screen
      .getAllByRole("button")
      .filter((b) => product.sizes.includes((b.textContent ?? "").trim()));
    expect(sizeButtons.length).toBeGreaterThan(1);
    const chosen = sizeButtons.filter((b) => b.getAttribute("aria-pressed") === "true");
    expect(chosen.length).toBe(1);
    expect(line.textContent).toContain(chosen[0]?.textContent?.trim());
    // The other sizes are still tappable, and their verdicts are on the button.
    expect(sizeButtons.some((b) => b.getAttribute("data-size-fit") === "skip")).toBe(true);
  });

  it("says nothing about a saved size when there is no profile", async () => {
    stubPromoApi(false);
    __resetPromos();
    renderPanel();
    await screen.findByText(/Size finder/i);
    expect(screen.queryByText(/Best for you:/)).not.toBeInTheDocument();
  });
});

describe("Buy box — price memory", () => {
  it("tells the shopper the price fell since this device last saw it", async () => {
    const was = product.price + 90_000;
    localStorage.setItem(
      PRICE_SNAPSHOT_KEY,
      JSON.stringify({ [product.id]: { price: was, at: Date.now() - 3 * 86_400_000 } }),
    );
    renderPanel();
    const note = await screen.findByText(/less since you last saw it/i);
    expect(note).toBeInTheDocument();
    expect(note.textContent).toContain(formatBdt(90_000));
    expect(note.textContent).toContain("You last saw it at");

    // Acknowledging keeps the promise but stops the nag.
    fireEvent.click(screen.getByRole("button", { name: /got it/i }));
    await waitFor(() => {
      expect(screen.queryByText(/less since you last saw it/i)).not.toBeInTheDocument();
    });
  });

  it("stays quiet when the price has not moved down", async () => {
    stubPromoApi(false);
    __resetPromos();
    localStorage.setItem(
      PRICE_SNAPSHOT_KEY,
      JSON.stringify({ [product.id]: { price: product.price, at: Date.now() - 86_400_000 } }),
    );
    renderPanel();
    await waitFor(() => {
      expect(screen.getAllByText(formatBdt(product.price)).length).toBeGreaterThan(0);
    });
    expect(screen.queryByText(/less since you last saw it/i)).not.toBeInTheDocument();
  });
});
