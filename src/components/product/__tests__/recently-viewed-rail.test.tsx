import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import RecentlyViewedRail, {
  RecentlyViewedTracker,
} from "@/components/product/recently-viewed-rail";
import { PRODUCTS } from "@/lib/catalog";
import { __resetLiveCatalog, __serveLiveCatalogForTests } from "@/lib/live-catalog";
import {
  clearRecentlyViewed,
  getRecentlyViewed,
  pushRecentlyViewed,
} from "@/lib/recently-viewed";
import { CartProvider } from "@/components/cart/cart-provider";

vi.mock("@/lib/use-live-catalog", async () => {
  const { PRODUCTS: rows, CATEGORIES } = await import("@/lib/catalog");
  return {
    useLiveCatalog: () => ({
      products: rows,
      categories: CATEGORIES,
      shops: [],
      live: true,
      loading: false,
      liveCategories: CATEGORIES,
    }),
  };
});

const [first, second, third] = PRODUCTS;

const renderRail = (excludeId?: string) =>
  render(
    <CartProvider>
      <RecentlyViewedRail excludeId={excludeId} />
    </CartProvider>,
  );

beforeEach(() => {
  localStorage.clear();
  clearRecentlyViewed();
  __serveLiveCatalogForTests(PRODUCTS, []);
});
afterEach(() => __resetLiveCatalog());
afterEach(cleanup);

describe("RecentlyViewedRail", () => {
  it("stays out of the way until the shopper has seen two pieces", () => {
    const { container } = renderRail();
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByTestId("recently-viewed-rail")).toBeNull();
  });

  it("shows the device's trail, newest first, resolved from the live catalog", () => {
    // Written through the public store API (not raw localStorage): the store
    // caches in memory, and only its own writes notify the subscribers.
    pushRecentlyViewed({ id: first.id, slug: first.slug });
    pushRecentlyViewed({ id: second.id, slug: second.slug });
    expect(getRecentlyViewed()[0].id).toBe(second.id);
    renderRail();
    expect(screen.getByTestId("recently-viewed-rail")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: second.name })).toBeInTheDocument();
  });

  it("never repeats the product being looked at right now", () => {
    pushRecentlyViewed({ id: third.id, slug: third.slug });
    pushRecentlyViewed({ id: second.id, slug: second.slug });
    pushRecentlyViewed({ id: first.id, slug: first.slug });
    expect(getRecentlyViewed()).toHaveLength(3);
    renderRail(first.id);
    expect(screen.queryByRole("link", { name: first.name })).toBeNull();
    expect(screen.getByRole("link", { name: second.name })).toBeInTheDocument();
  });

  it("drops a piece the shop has since taken down", () => {
    pushRecentlyViewed({ id: "gone-1", slug: "gone-1" });
    pushRecentlyViewed({ id: "gone-2", slug: "gone-2" });
    expect(getRecentlyViewed()).toHaveLength(2);
    renderRail();
    // Both entries resolve to nothing → a shelf of zero renders nothing,
    // rather than a broken card or an old price.
    expect(screen.queryByTestId("recently-viewed-rail")).toBeNull();
  });

  it("clears the trail on request", () => {
    pushRecentlyViewed({ id: first.id, slug: first.slug });
    pushRecentlyViewed({ id: second.id, slug: second.slug });
    renderRail();
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(screen.queryByTestId("recently-viewed-rail")).toBeNull();
    expect(localStorage.getItem("prosanti.recently-viewed.v1")).toBe("[]");
  });
});

describe("RecentlyViewedTracker", () => {
  it("records the product page that was opened", () => {
    render(<RecentlyViewedTracker product={{ id: first.id, slug: first.slug }} />);
    expect(getRecentlyViewed()[0]).toMatchObject({
      id: first.id,
      slug: first.slug,
    });
  });
});
