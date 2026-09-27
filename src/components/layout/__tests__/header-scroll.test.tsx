import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import Header from "@/components/layout/header";
import { LanguageProvider } from "@/components/i18n/language-provider";
import { CartProvider } from "@/components/cart/cart-provider";

/**
 * Scroll audit 2026-09-27 — the sticky header must be paint-only while the
 * page moves: no React render per scrolled frame, no height change, the
 * progress line driven through a ref, the announcement bar outside the
 * sticky element so it scrolls away instead of folding.
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
  usePathname: () => "/",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

let childRenders = 0;
vi.mock("@/components/layout/product-search", () => ({
  default: () => {
    childRenders += 1;
    return <div data-testid="search-stub" />;
  },
}));

const scrollTo = (y: number, docHeight = 4000, viewport = 800) => {
  Object.defineProperty(window, "scrollY", { configurable: true, value: y });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: viewport });
  Object.defineProperty(document.documentElement, "scrollHeight", {
    configurable: true,
    value: docHeight,
  });
  window.dispatchEvent(new Event("scroll"));
};

const renderHeader = () =>
  render(
    <LanguageProvider>
      <CartProvider>
        <Header />
      </CartProvider>
    </LanguageProvider>,
  );

beforeEach(() => {
  childRenders = 0;
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    cb(0);
    return 1;
  });
  // Page geometry the header measures on mount (and again on resize).
  scrollTo(0);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  scrollTo(0);
});

describe("Header — paint-only while scrolling", () => {
  it("keeps one bar height and puts the announcement bar outside the sticky element", () => {
    const { container } = renderHeader();
    const header = container.querySelector("header.storefront-header")!;
    expect(header).not.toBeNull();
    expect(header.className).not.toMatch(/transition-\[height\]/);
    const bar = header.querySelector(".header-bar > div")!;
    // A fixed height per breakpoint — the shop filter bar sticks under it
    // at `top-14 sm:top-[4.1rem]`.
    expect(bar.className).toMatch(/\bh-14\b/);
    expect(bar.className).toMatch(/sm:h-\[4\.1rem\]/);
    expect(bar.className).not.toMatch(/transition/);
    // Nothing that folds: no grid-rows shell inside the sticky header.
    expect(header.querySelector(".announcement-shell")).toBeNull();
  });

  it("flips data-scrolled once past 10px and writes progress to the gold line without re-rendering the bar", () => {
    const { container } = renderHeader();
    const header = container.querySelector("header.storefront-header")!;
    const line = header.querySelector<HTMLElement>(".header-progress")!;
    expect(header.getAttribute("data-scrolled")).toBe("false");
    expect(screen.getByTestId("search-stub")).toBeInTheDocument();
    const afterMount = childRenders;

    act(() => scrollTo(1600));
    expect(header.getAttribute("data-scrolled")).toBe("true");
    // 1600 / (4000 − 800) = 0.5
    expect(line.style.transform).toBe("scaleX(0.5000)");
    const afterFlip = childRenders;

    // Twenty more frames deeper into the page: the line moves, the header's
    // children are not rendered again.
    for (let i = 1; i <= 20; i += 1) {
      act(() => scrollTo(1600 + i * 40));
    }
    expect(line.style.transform).toBe("scaleX(0.7500)");
    expect(header.getAttribute("data-scrolled")).toBe("true");
    expect(childRenders).toBe(afterFlip);
    // The single flip itself is at most one render of the children.
    expect(afterFlip - afterMount).toBeLessThanOrEqual(1);

    act(() => scrollTo(0));
    expect(header.getAttribute("data-scrolled")).toBe("false");
    expect(line.style.transform).toBe("scaleX(0.0000)");

    // The page grows (live catalog answered): the denominator is re-measured
    // on resize, not by reading scrollHeight on every scrolled frame.
    act(() => {
      scrollTo(1600, 7200, 800);
      window.dispatchEvent(new Event("resize"));
    });
    // 1600 / (7200 − 800) = 0.25
    expect(line.style.transform).toBe("scaleX(0.2500)");
  });

  it("blurs the bar only for fine pointers — phones get a near-opaque bar", () => {
    const { container } = renderHeader();
    const bar = container.querySelector(".header-bar")!;
    expect(bar.className).toMatch(/pointer-fine:backdrop-blur/);
    expect(bar.className).not.toMatch(/(^|\s)backdrop-blur/);
    expect(bar.className).toMatch(/bg-ivory-50\/96/);
  });
});
