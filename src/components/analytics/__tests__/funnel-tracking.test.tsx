/**
 * UX plan §0 — the storefront's own funnel events fire from the right
 * places, first-party, with or without a vendor tag:
 *   • the route tracker records the FIRST page view (sessions need it);
 *   • a typed search counts once it rests, with its result count;
 *   • tapping a card → select_item credited to the surrounding rail;
 *   • a rail scrolling into view → view_item_list, once;
 *   • add to bag carries its source (card / pdp / bundle / live);
 *   • home scroll marks fire once each.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { __queuedEvents, __resetEventsSink } from "@/lib/events-sink";
import { CATEGORIES, PRODUCTS } from "@/lib/catalog";
import { __resetLiveCatalog, __serveLiveCatalogForTests } from "@/lib/live-catalog";
import { CartProvider } from "@/components/cart/cart-provider";
import { LanguageProvider } from "@/components/i18n/language-provider";
import AnalyticsRouteTracker from "@/components/analytics/analytics-route-tracker";
import ListImpression, { listNameFor } from "@/components/analytics/list-impression";
import ScrollDepthTracker from "@/components/analytics/scroll-depth-tracker";
import ProductCard from "@/components/product/product-card";
import ProductSearch from "@/components/layout/product-search";

const nav = vi.hoisted(() => ({ pathname: "/" as string, push: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({ push: nav.push, replace: vi.fn(), prefetch: vi.fn() }),
}));
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

const product = PRODUCTS.find((item) => item.inStock)!;
/* `lang` rides on every event (whatever <html lang> is) — strip it here so
   the assertions stay about the funnel fields. */
const events = () =>
  __queuedEvents().map((e) => {
    const copy = { ...e };
    delete copy.lang;
    return copy;
  });
const ofType = (t: string) => events().filter((e) => e.t === t);

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  document.cookie = "prosanti-lang=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
  __resetEventsSink();
  nav.pathname = "/";
  nav.push.mockClear();
  __serveLiveCatalogForTests(PRODUCTS, CATEGORIES);
  vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response(null, { status: 204 }))));
});
afterEach(() => {
  cleanup();
  __resetLiveCatalog();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("AnalyticsRouteTracker", () => {
  it("records the first page view first-party (no vendor tag needed) and each navigation after", () => {
    document.documentElement.lang = "bn";
    const { rerender } = render(<AnalyticsRouteTracker />);
    expect(__queuedEvents()).toEqual([{ t: "page_view", p: "/", lang: "bn" }]);
    rerender(<AnalyticsRouteTracker />);
    expect(ofType("page_view")).toHaveLength(1);
    nav.pathname = "/shop";
    rerender(<AnalyticsRouteTracker />);
    expect(ofType("page_view").map((e) => e.p)).toEqual(["/", "/shop"]);
  });
});

describe("ProductSearch → search event", () => {
  it("counts a query once it rests, with the number of results, and not twice", () => {
    vi.useFakeTimers();
    render(
      <LanguageProvider initialLang="en">
        <ProductSearch />
      </LanguageProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: /search/i }));
    const input = screen.getByRole("searchbox");
    fireEvent.change(input, { target: { value: "p" } });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(ofType("search")).toHaveLength(0); // one letter is not a search yet
    fireEvent.change(input, { target: { value: "Panjabi" } });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(ofType("search")).toHaveLength(0);
    act(() => {
      vi.advanceTimersByTime(400);
    });
    const [ev] = ofType("search");
    expect(ev.meta).toEqual({ q: "panjabi" });
    expect(ev.v).toBeGreaterThan(0);
    fireEvent.submit(input.closest("form")!);
    expect(ofType("search")).toHaveLength(1); // same query — not counted again
    expect(nav.push).toHaveBeenCalledTimes(1);
  });

  it("flags a search the shop has nothing for (results 0)", () => {
    vi.useFakeTimers();
    render(
      <LanguageProvider initialLang="en">
        <ProductSearch />
      </LanguageProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: /search/i }));
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "zzqx-nothing" } });
    act(() => {
      vi.advanceTimersByTime(900);
    });
    expect(ofType("search")).toEqual([{ t: "search", p: "/", v: 0, meta: { q: "zzqx-nothing" } }]);
  });
});

describe("ProductCard → select_item / add_to_cart source", () => {
  it("credits a tap to the nearest data-list, and quick-add to 'card'", () => {
    render(
      <CartProvider>
        <section data-list="offers-rail">
          <ProductCard product={product} />
        </section>
      </CartProvider>,
    );
    fireEvent.click(screen.getByRole("link", { name: `View details for ${product.name}` }));
    expect(ofType("select_item")).toMatchObject([
      { t: "select_item", p: "/", pid: product.id, src: "offers-rail" },
    ]);
    fireEvent.click(screen.getByRole("button", { name: `Quick add ${product.name} to cart` }));
    fireEvent.click(screen.getByRole("button", { name: product.sizes[0] }));
    fireEvent.click(screen.getByRole("button", { name: "Add to Bag →" }));
    const [atc] = ofType("add_to_cart");
    expect(atc).toMatchObject({ t: "add_to_cart", pid: product.id, src: "card", v: product.price });
  });

  it("falls back to the path when no list wraps the card", () => {
    expect(listNameFor(document.body, "/shop")).toBe("/shop");
  });
});

describe("ListImpression → view_item_list", () => {
  it("fires once when the sentinel intersects", () => {
    let callback: IntersectionObserverCallback | null = null;
    const observe = vi.fn();
    const disconnect = vi.fn();
    vi.stubGlobal(
      "IntersectionObserver",
      vi.fn((cb: IntersectionObserverCallback) => {
        callback = cb;
        return { observe, disconnect, unobserve: vi.fn(), takeRecords: () => [], root: null, rootMargin: "", thresholds: [] };
      }),
    );
    render(<ListImpression list="shelf-panjabi" count={8} />);
    expect(observe).toHaveBeenCalledTimes(1);
    act(() => {
      callback?.([{ isIntersecting: false } as IntersectionObserverEntry], {} as IntersectionObserver);
    });
    expect(ofType("view_item_list")).toHaveLength(0);
    act(() => {
      callback?.([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
    });
    expect(ofType("view_item_list")).toEqual([{ t: "view_item_list", p: "/", src: "shelf-panjabi", v: 8 }]);
    expect(disconnect).toHaveBeenCalled();
  });
});

describe("ScrollDepthTracker", () => {
  it("fires each mark once as the shopper scrolls the home page", () => {
    Object.defineProperty(document.documentElement, "scrollHeight", { value: 4000, configurable: true });
    Object.defineProperty(window, "innerHeight", { value: 1000, configurable: true, writable: true });
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    });
    render(<ScrollDepthTracker />);
    const scrollTo = (y: number) => {
      Object.defineProperty(window, "scrollY", { value: y, configurable: true, writable: true });
      fireEvent.scroll(window);
    };
    scrollTo(300);
    scrollTo(1600);
    scrollTo(1600);
    expect(ofType("scroll_depth").map((e) => e.v)).toEqual([25, 50]);
    scrollTo(3000);
    expect(ofType("scroll_depth").map((e) => e.v)).toEqual([25, 50, 75, 100]);
    expect(ofType("scroll_depth")[0]).toMatchObject({ p: "/" });
  });
});
