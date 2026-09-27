/**
 * UX plan §5 (R11) — "পরে কিনব": a bag line moves to the wishlist instead of
 * the bin, the drawer says so with a way to the wishlist, and the piece is
 * really there (guest store) for the next visit.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import BagDrawer from "@/components/cart/bag-drawer";
import CartView from "@/components/cart/cart-view";
import { CartProvider, useCart } from "@/components/cart/cart-provider";
import { LanguageProvider } from "@/components/i18n/language-provider";
import { CATEGORIES, PRODUCTS } from "@/lib/catalog";
import { CART_STORAGE_KEY } from "@/lib/cart";
import { __resetLiveCatalog, __serveLiveCatalogForTests } from "@/lib/live-catalog";
import { WISHLIST_STORAGE_KEY, clearWishlistStore } from "@/lib/wishlist-store";

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

function OpenBag() {
  const { openBag } = useCart();
  return (
    <button type="button" onClick={openBag}>
      open-bag
    </button>
  );
}

const p0 = PRODUCTS[0]!;
const p1 = PRODUCTS[1]!;
const line = (p: typeof p0) => ({ productId: p.id, variantLabel: `${p.colors[0]} · ${p.sizes[0]}`, qty: 1 });

beforeEach(() => {
  window.localStorage.clear();
  // the guest wishlist store caches in memory — start each test empty
  clearWishlistStore();
  document.cookie = "prosanti-lang=; max-age=0; path=/";
  window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify([line(p0), line(p1)]));
  __serveLiveCatalogForTests(PRODUCTS, CATEGORIES);
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve(new Response(JSON.stringify({}), { status: 200 }))),
  );
});

afterEach(() => {
  cleanup();
  __resetLiveCatalog();
  vi.unstubAllGlobals();
});

const savedIds = () => JSON.parse(window.localStorage.getItem(WISHLIST_STORAGE_KEY) ?? "[]") as string[];
const bagIds = () =>
  (JSON.parse(window.localStorage.getItem(CART_STORAGE_KEY) ?? "[]") as { productId: string }[]).map((l) => l.productId);

describe("Save for later — bag drawer", () => {
  it("moves the line to the wishlist, confirms it and links to /wishlist (Bengali)", async () => {
    render(
      <LanguageProvider initialLang="bn">
        <CartProvider>
          <OpenBag />
          <BagDrawer />
        </CartProvider>
      </LanguageProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "open-bag" }));
    const dialog = await screen.findByRole("dialog");
    const buttons = within(dialog).getAllByTestId("save-for-later");
    expect(buttons).toHaveLength(2);
    expect(buttons[0]).toHaveTextContent("পরে কিনব");
    await act(async () => {
      fireEvent.click(buttons[0]!);
    });
    await waitFor(() => expect(savedIds()).toEqual([p0.id]));
    expect(bagIds()).toEqual([p1.id]);
    const notice = within(dialog).getByTestId("saved-for-later-notice");
    expect(notice).toHaveTextContent(`"${p0.name}" উইশলিস্টে রাখা হলো`);
    expect(within(notice).getByRole("link", { name: /উইশলিস্ট দেখুন/ })).toHaveAttribute("href", "/wishlist");
    // the other line keeps its own button; the bag is not emptied
    expect(within(dialog).getAllByTestId("save-for-later")).toHaveLength(1);
  });

  it("does not duplicate a piece that is already on the wishlist", async () => {
    window.localStorage.setItem(WISHLIST_STORAGE_KEY, JSON.stringify([p0.id]));
    render(
      <LanguageProvider initialLang="en">
        <CartProvider>
          <OpenBag />
          <BagDrawer />
        </CartProvider>
      </LanguageProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "open-bag" }));
    const dialog = await screen.findByRole("dialog");
    await act(async () => {
      fireEvent.click(within(dialog).getAllByTestId("save-for-later")[0]!);
    });
    await waitFor(() => expect(bagIds()).toEqual([p1.id]));
    expect(savedIds()).toEqual([p0.id]);
    expect(within(dialog).getByTestId("saved-for-later-notice")).toHaveTextContent(/moved to your wishlist/);
  });
});

describe("Save for later — /cart page", () => {
  it("offers the same move next to Remove", async () => {
    render(
      <LanguageProvider initialLang="en">
        <CartProvider>
          <CartView />
        </CartProvider>
      </LanguageProvider>,
    );
    const buttons = await screen.findAllByTestId("save-for-later");
    expect(buttons).toHaveLength(2);
    await act(async () => {
      fireEvent.click(buttons[1]!);
    });
    await waitFor(() => expect(savedIds()).toEqual([p1.id]));
    expect(bagIds()).toEqual([p0.id]);
    expect(screen.getByTestId("saved-for-later-notice")).toHaveTextContent(p1.name);
  });
});
