/**
 * UX plan §8 (R6) — the wishlist: sold-out last, a shareable link, a shared
 * list you can read/buy/keep, and a suggestion rail underneath.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import WishlistView, {
  SHARED_IDS_MAX,
  parseSharedIds,
  wishlistShareHref,
} from "@/components/wishlist/wishlist-view";
import { CartProvider } from "@/components/cart/cart-provider";
import { LanguageProvider } from "@/components/i18n/language-provider";
import { CATEGORIES, PRODUCTS } from "@/lib/catalog";
import { __resetLiveCatalog, __serveLiveCatalogForTests } from "@/lib/live-catalog";
import { clearWishlistStore, getWishlist, toggleWishlistStore } from "@/lib/wishlist-store";

const SOLD_OUT_ID = PRODUCTS[0].id;
const catalog = PRODUCTS.map((p) => (p.id === SOLD_OUT_ID ? { ...p, inStock: false } : p));

vi.mock("@/lib/use-live-catalog", async () => {
  const { CATEGORIES, PRODUCTS } = await import("@/lib/catalog");
  const soldOut = PRODUCTS[0].id;
  const products = PRODUCTS.map((p) => (p.id === soldOut ? { ...p, inStock: false } : p));
  return {
    useLiveCatalog: () => ({
      products,
      categories: CATEGORIES,
      shops: [],
      live: false,
      loading: false,
      liveCategories: CATEGORIES,
    }),
  };
});

const mount = (lang: "en" | "bn" = "en") =>
  render(
    <LanguageProvider initialLang={lang}>
      <CartProvider>
        <WishlistView />
      </CartProvider>
    </LanguageProvider>,
  );

const cardHrefs = (grid: HTMLElement) =>
  within(grid)
    .getAllByTestId("card-peek")
    .map((a) => a.getAttribute("href"));

beforeEach(() => {
  localStorage.clear();
  clearWishlistStore();
  document.cookie = "prosanti-lang=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
  window.history.replaceState(null, "", "/wishlist");
  __serveLiveCatalogForTests(catalog, CATEGORIES);
});
afterEach(() => {
  cleanup();
  __resetLiveCatalog();
  vi.unstubAllGlobals();
});

describe("pure helpers", () => {
  it("parses, trims, dedupes and caps shared ids; builds the share link", () => {
    expect(parseSharedIds("?ids=a,%20b%20,a,,c")).toEqual(["a", "b", "c"]);
    expect(parseSharedIds("")).toEqual([]);
    const many = Array.from({ length: SHARED_IDS_MAX + 5 }, (_, i) => `p${i}`).join(",");
    expect(parseSharedIds(`?ids=${many}`)).toHaveLength(SHARED_IDS_MAX);
    expect(wishlistShareHref("https://prosanti.app", ["a", "b"])).toBe("https://prosanti.app/wishlist?ids=a%2Cb");
  });
});

describe("<WishlistView> — own list", () => {
  it("puts sold-out pieces last, says so, offers a share link and a rail", async () => {
    toggleWishlistStore(SOLD_OUT_ID); // saved first…
    toggleWishlistStore(PRODUCTS[3].id);
    mount();
    const grid = document.querySelector("[data-list='wishlist']") as HTMLElement;
    const hrefs = cardHrefs(grid);
    expect(hrefs).toHaveLength(2);
    expect(hrefs[hrefs.length - 1]).toBe(`/product/${PRODUCTS[0].slug}`); // …but shown last
    expect(screen.getByTestId("wishlist-soldout-note")).toBeInTheDocument();
    const share = screen.getByTestId("wishlist-share");
    const href = decodeURIComponent(share.getAttribute("href")!);
    expect(href.startsWith("https://wa.me/?text=")).toBe(true);
    expect(href).toContain("/wishlist?ids=");
    expect(href).toContain(PRODUCTS[3].id);
    expect(screen.getByTestId("wishlist-rail")).toBeInTheDocument();
    // The rail never repeats a saved piece.
    const railHrefs = cardHrefs(screen.getByTestId("wishlist-rail"));
    for (const h of hrefs) expect(railHrefs).not.toContain(h);
    expect(screen.getByRole("button", { name: /Clear all/ })).toBeInTheDocument();
  });
});

describe("<WishlistView> — a list someone shared", () => {
  it("reads ?ids=, shows the shared header, and saves the pieces to my own list", async () => {
    window.history.replaceState(null, "", `/wishlist?ids=${PRODUCTS[1].id},${PRODUCTS[2].id}`);
    mount("bn");
    const header = screen.getByTestId("wishlist-shared");
    expect(within(header).getByRole("heading", { name: "আপনার সাথে শেয়ার করা পছন্দের তালিকা" })).toBeVisible();
    expect(screen.queryByRole("button", { name: /সব মুছুন/ })).not.toBeInTheDocument();
    const grid = document.querySelector("[data-list='wishlist']") as HTMLElement;
    expect(cardHrefs(grid)).toEqual([`/product/${PRODUCTS[1].slug}`, `/product/${PRODUCTS[2].slug}`]);
    expect(getWishlist()).toEqual([]);
    fireEvent.click(screen.getByTestId("save-shared"));
    await waitFor(() => expect(getWishlist().sort()).toEqual([PRODUCTS[1].id, PRODUCTS[2].id].sort()));
    await waitFor(() => expect(screen.getByTestId("save-shared")).toHaveTextContent("রাখা হয়েছে"));
    expect(screen.getByTestId("save-shared")).toBeDisabled();
  });
});
