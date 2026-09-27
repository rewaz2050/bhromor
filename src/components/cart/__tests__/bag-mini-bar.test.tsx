/**
 * UX plan §1.3 (2026-09-26) — the sticky bag mini-bar on listing pages:
 * "3 items · ৳1,490 · Checkout →" above the bottom nav; tap the summary to
 * open the drawer; absent on the product / bag / checkout pages, with an
 * empty bag, and while the drawer is open.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import BagMiniBar, { showsBagMiniBar } from "@/components/cart/bag-mini-bar";
import { CartProvider, useCart } from "@/components/cart/cart-provider";
import { CATEGORIES, PRODUCTS } from "@/lib/catalog";
import { CART_STORAGE_KEY } from "@/lib/cart";
import { __resetLiveCatalog, __serveLiveCatalogForTests } from "@/lib/live-catalog";

const pathRef = { current: "/shop" };
vi.mock("next/navigation", () => ({
  usePathname: () => pathRef.current,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
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

function BagState() {
  const { bagOpen } = useCart();
  return <output aria-label="bag open">{String(bagOpen)}</output>;
}

const p = PRODUCTS.find((x) => x.inStock)!;
const seedBag = (qty: number) =>
  window.localStorage.setItem(
    CART_STORAGE_KEY,
    JSON.stringify([{ productId: p.id, variantLabel: `${p.colors[0]} · ${p.sizes[0]}`, qty }]),
  );

beforeEach(() => {
  window.localStorage.clear();
  pathRef.current = "/shop";
  __serveLiveCatalogForTests(PRODUCTS, CATEGORIES);
});
afterEach(() => {
  cleanup();
  __resetLiveCatalog();
});

const mount = () =>
  render(
    <CartProvider>
      <BagState />
      <BagMiniBar />
    </CartProvider>,
  );

describe("showsBagMiniBar", () => {
  it("listing routes only — never the product page, the bag or the checkout", () => {
    for (const path of ["/shop", "/shop?category=panjabi", "/shops", "/shops/shop-one", "/campaign/eid", "/wishlist"]) {
      expect(showsBagMiniBar(path)).toBe(true);
    }
    for (const path of ["/", "/product/x", "/cart", "/checkout", "/track", "/account", null]) {
      expect(showsBagMiniBar(path)).toBe(false);
    }
  });
});

describe("BagMiniBar", () => {
  it("renders nothing with an empty bag", async () => {
    mount();
    await waitFor(() => expect(screen.getByLabelText("bag open")).toHaveTextContent("false"));
    expect(screen.queryByTestId("bag-mini-bar")).toBeNull();
  });

  it("shows the count + subtotal and a checkout link; the summary opens the drawer", async () => {
    seedBag(2);
    mount();
    const bar = await screen.findByTestId("bag-mini-bar");
    expect(bar).toHaveTextContent(`2 items · ৳${((p.price * 2) / 100).toLocaleString("en-IN")}`);
    expect(screen.getByRole("link", { name: /checkout/i })).toHaveAttribute("href", "/checkout");
    fireEvent.click(screen.getByRole("button", { name: /view bag/i }));
    expect(screen.getByLabelText("bag open")).toHaveTextContent("true");
    // hidden while the drawer is open
    expect(screen.queryByTestId("bag-mini-bar")).toBeNull();
  });

  it("stays away from the product page even with a full bag", async () => {
    seedBag(1);
    pathRef.current = "/product/heritage-green";
    mount();
    await waitFor(() => expect(screen.getByLabelText("bag open")).toHaveTextContent("false"));
    expect(screen.queryByTestId("bag-mini-bar")).toBeNull();
  });
});
