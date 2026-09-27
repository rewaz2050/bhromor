/** UX plan §10 (R7) — /live is never an empty room; (R10) the last live's pieces stay on the shelf. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import LiveView from "@/components/live/live-view";
import { CartProvider } from "@/components/cart/cart-provider";
import { LanguageProvider } from "@/components/i18n/language-provider";
import { CATEGORIES, PRODUCTS } from "@/lib/catalog";
import { __resetLiveCatalog, __serveLiveCatalogForTests } from "@/lib/live-catalog";
import { newArrivals } from "@/lib/home-shelves";
import type { LiveSession } from "@/lib/live";

const piece = (id: string, name: string, inStock = true) => ({
  productId: id,
  name,
  slug: `slug-${id}`,
  price: 120000,
  image: undefined,
  inStock,
  defaultVariantLabel: "Green · M",
  onAir: false,
});

const lastSession: LiveSession = {
  id: "s-last",
  title: "ঈদের লাইভ",
  description: "",
  streamUrl: "",
  youtubeId: null,
  scheduledStart: Date.UTC(2026, 8, 20, 14, 0),
  liveAt: Date.UTC(2026, 8, 20, 14, 5),
  endedAt: Date.UTC(2026, 8, 20, 15, 0),
  status: "ended",
  products: [piece("lp1", "Sold Out Kurti", false), piece("lp2", "Live Panjabi"), piece("lp3", "Live Saree")],
};

const serveLive = (body: unknown) => {
  globalThis.fetch = (() =>
    Promise.resolve(new Response(JSON.stringify(body), { status: 200 }))) as typeof fetch;
};

const catalog = vi.hoisted(() => ({ products: [] as unknown[] }));
vi.mock("@/lib/use-live-catalog", async () => {
  const { CATEGORIES } = await import("@/lib/catalog");
  return {
    useLiveCatalog: () => ({
      products: catalog.products,
      categories: CATEGORIES,
      shops: [],
      live: false,
      loading: false,
      liveCategories: CATEGORIES,
    }),
  };
});

const originalFetch = globalThis.fetch;
const mount = (lang: "en" | "bn" = "bn") =>
  render(
    <LanguageProvider initialLang={lang}>
      <CartProvider>
        <LiveView />
      </CartProvider>
    </LanguageProvider>,
  );

beforeEach(() => {
  localStorage.clear();
  document.cookie = "prosanti-lang=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
  catalog.products = PRODUCTS;
  __serveLiveCatalogForTests(PRODUCTS, CATEGORIES);
  // /api/live: nothing on air, nothing scheduled.
  globalThis.fetch = (() =>
    Promise.resolve(new Response(JSON.stringify({ live: null, upcoming: null }), { status: 200 }))) as typeof fetch;
});
afterEach(() => {
  cleanup();
  __resetLiveCatalog();
  globalThis.fetch = originalFetch;
});

describe("<LiveView> with no session", () => {
  it("says so honestly and then puts the new arrivals on stage, newest first, in Bengali", async () => {
    mount();
    await waitFor(() => expect(screen.getByText(/No live shopping right now/)).toBeTruthy());
    const rail = screen.getByTestId("live-new-rail");
    expect(within(rail).getByRole("link", { name: /সব নতুন আসা দেখুন/ })).toHaveAttribute("href", "/shop?filter=new");
    const hrefs = within(rail)
      .getAllByTestId("card-peek")
      .map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(newArrivals(PRODUCTS, 8).map((p) => `/product/${p.slug}`));
    expect(hrefs.length).toBeGreaterThanOrEqual(2);
  });

  it("does not invent a rail when the catalog has nothing orderable", async () => {
    catalog.products = PRODUCTS.map((p) => ({ ...p, inStock: false }));
    mount("en");
    await waitFor(() => expect(screen.getByText(/No live shopping right now/)).toBeTruthy());
    expect(screen.queryByTestId("live-new-rail")).toBeNull();
    expect(screen.queryByTestId("live-last-rail")).toBeNull();
  });
});

describe("<LiveView> — the last live's pieces (R10)", () => {
  it("puts the last session's pieces on stage, in-stock first, Bengali digits, before the new arrivals", async () => {
    serveLive({ live: null, upcoming: null, last: lastSession });
    mount("bn");
    const rail = await screen.findByTestId("live-last-rail");
    expect(within(rail).getByRole("heading", { name: /গত লাইভে যে পিসগুলো দেখিয়েছিলাম/ })).toBeTruthy();
    expect(rail).toHaveTextContent("ঈদের লাইভ");
    expect(rail).toHaveTextContent(/৩টি পিস — এখনও অর্ডার করা যায়/);
    const names = within(rail)
      .getAllByRole("link", { name: /Live Panjabi|Live Saree|Sold Out Kurti/ })
      .filter((a) => a.textContent && /Live Panjabi|Live Saree|Sold Out Kurti/.test(a.textContent))
      .map((a) => a.textContent?.trim());
    expect(names[0]).toBe("Live Panjabi");
    expect(names[names.length - 1]).toBe("Sold Out Kurti");
    expect(within(rail).getByRole("button", { name: /Sold out/ })).toBeDisabled();
    // the new-arrivals fallback still follows, after the last-live rail
    const newRail = screen.getByTestId("live-new-rail");
    expect(rail.compareDocumentPosition(newRail) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("keeps the rail under an upcoming session and drops it while on air", async () => {
    const upcoming: LiveSession = {
      ...lastSession,
      id: "s-next",
      title: "Next drop",
      status: "scheduled",
      liveAt: undefined,
      endedAt: undefined,
      scheduledStart: Date.now() + 3 * 60 * 60 * 1000,
      products: [],
    };
    serveLive({ live: null, upcoming, last: lastSession });
    mount("en");
    await screen.findByText(/Coming up/);
    expect(screen.getByTestId("live-last-rail")).toHaveTextContent(/From the last live/);
    expect(screen.queryByTestId("live-new-rail")).toBeNull();
    cleanup();

    const live: LiveSession = { ...upcoming, id: "s-live", status: "live", liveAt: Date.now() - 60_000 };
    serveLive({ live, upcoming: null, last: lastSession });
    mount("en");
    await screen.findByText(/Live now/);
    expect(screen.queryByTestId("live-last-rail")).toBeNull();
    expect(screen.queryByTestId("live-new-rail")).toBeNull();
  });
});
