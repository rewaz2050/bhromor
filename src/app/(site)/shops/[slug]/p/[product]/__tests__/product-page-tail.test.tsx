/**
 * Product page tail (2026-09-20): the LAST section of a product page is the
 * rest of the piece's own category — nothing from other categories, never
 * the piece itself — and it sits below the reviews.
 *
 * C5 — the page itself now lives at `/shops/<shop>/p/<piece>`, so a piece is
 * addressed by its shop as well as its name.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, within } from "@testing-library/react";
import { CATEGORIES, PRODUCTS, type Shop } from "@/lib/catalog";

const launchShop = (): Shop => ({
  id: "shop-1",
  slug: "prosanti-direct",
  name: "PROSANTI Direct",
  phone: "01700000000",
  zoneIds: ["z1"],
  prepMinutes: 15,
  commissionPct: 15,
  status: "active",
  isOpen: true,
  ratingAvg: 0,
  ratingCount: 0,
});

// The server-only storefront read → the launch seeds, so the page renders
// without a database. `findStorefrontProduct` keeps the real slug lookup.
vi.mock("@/lib/db/storefront", () => ({
  getStorefrontCatalog: async () => ({
    products: PRODUCTS,
    categories: CATEGORIES,
    shops: [launchShop()],
    live: true,
  }),
  findStorefrontShop: (shops: Shop[], slug: string) =>
    shops.find((s) => s.slug === slug),
  findShopProduct: (
    products: typeof PRODUCTS,
    shops: Shop[],
    shopSlug: string,
    productSlug: string,
  ) => {
    const shop = shops.find((s) => s.slug === shopSlug);
    if (!shop) return undefined;
    return products.find(
      (p) => p.slug === productSlug && (p.shopId ?? shops[0]?.id) === shop.id,
    );
  },
}));

// R11 co-purchase rail — a server-only DB read; no baskets in this test.
vi.mock("@/lib/db/also-bought", () => ({
  alsoBoughtProducts: async () => [],
}));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/product/heritage-green-panjabi",
  useSearchParams: () => new URLSearchParams(),
}));

import ProductPage from "../page";
import { CartProvider } from "@/components/cart/cart-provider";
import { LanguageProvider } from "@/components/i18n/language-provider";
import { __resetRecentlyViewed, getViewed, recordView } from "@/lib/recently-viewed";

const originalFetch = globalThis.fetch;

beforeEach(() => {
  localStorage.clear();
  __resetRecentlyViewed();
  // Every client probe on the page (reviews, promos, zones…) answers empty.
  globalThis.fetch = (() =>
    Promise.resolve(new Response(JSON.stringify({}), { status: 200 }))) as unknown as typeof fetch;
});

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
});

async function renderProduct(shopSlug: string, productSlug: string) {
  const ui = await ProductPage({
    params: Promise.resolve({ slug: shopSlug, product: productSlug }),
  });
  const view = render(
    <LanguageProvider>
      <CartProvider>{ui}</CartProvider>
    </LanguageProvider>,
  );
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return view;
}

describe("Product page — same-category shelf at the very bottom", () => {
  it("ends with the rest of the piece's own category, below the reviews", async () => {
    const product = PRODUCTS.find((p) => p.slug === "heritage-green-panjabi")!;
    const { container } = await renderProduct("prosanti-direct", product.slug);

    const tail = container.querySelector('[data-testid="more-in-category"]') as HTMLElement;
    expect(tail).not.toBeNull();
    expect(tail.getAttribute("data-category")).toBe(product.category);

    // Last <section> on the page, and after the reviews block.
    const sections = Array.from(container.querySelectorAll("section"));
    expect(sections[sections.length - 1]).toBe(tail);
    const reviews = within(container).getByRole("heading", { name: /reviews/i });
    expect(
      reviews.compareDocumentPosition(tail) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    // Only siblings from the same category — never the piece itself.
    const cards = within(tail).getAllByRole("article");
    expect(cards.length).toBeGreaterThan(0);
    const shown = cards.map((card) =>
      PRODUCTS.find((p) => within(card).queryByRole("link", { name: `View ${p.name}` })),
    );
    for (const p of shown) {
      expect(p).toBeDefined();
      expect(p!.category).toBe(product.category);
      expect(p!.id).not.toBe(product.id);
    }
    const expected = PRODUCTS.filter(
      (p) =>
        p.category === product.category &&
        p.id !== product.id &&
        p.active !== false &&
        p.status !== "draft",
    ).map((p) => p.id);
    expect(shown.map((p) => p!.id).sort()).toEqual(expected.sort());

    // Heading links into the scoped shop.
    expect(
      within(tail).getByRole("heading", { level: 2 }).querySelector("a"),
    ).toHaveAttribute("href", `/shop?category=${product.category}`);

    // C5 — the breadcrumb names the shop whose shelf this piece sits on.
    const trail = within(container).getByRole("navigation", { name: "Breadcrumb" });
    expect(within(trail).getByRole("link", { name: "PROSANTI Direct" })).toHaveAttribute(
      "href",
      "/shops/prosanti-direct",
    );
  });

  it("remembers the view and shows earlier views ABOVE the same-category shelf", async () => {
    const product = PRODUCTS.find((p) => p.slug === "heritage-green-panjabi")!;
    const other = PRODUCTS.find((p) => p.id !== product.id && p.active !== false && p.status !== "draft")!;

    // First visit on this device: nothing viewed before → no rail, but the
    // view itself is remembered.
    let view = await renderProduct("prosanti-direct", product.slug);
    expect(view.container.querySelector('[data-testid="recently-viewed"]')).toBeNull();
    expect(getViewed().map((e) => e.id)).toEqual([product.id]);
    cleanup();

    // Another piece was viewed earlier → it shows, the current piece does not,
    // and the category shelf is still the very last section.
    recordView(other.id, Date.now() - 1000);
    view = await renderProduct("prosanti-direct", product.slug);
    const rail = view.container.querySelector('[data-testid="recently-viewed"]') as HTMLElement;
    expect(rail).not.toBeNull();
    expect(within(rail).getByRole("link", { name: `View ${other.name}` })).toBeInTheDocument();
    expect(within(rail).queryByRole("link", { name: `View ${product.name}` })).toBeNull();
    const sections = Array.from(view.container.querySelectorAll("section"));
    const tail = view.container.querySelector('[data-testid="more-in-category"]') as HTMLElement;
    expect(sections[sections.length - 1]).toBe(tail);
    expect(rail.compareDocumentPosition(tail) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe("Product page — the AOV lever right under the buy panel (UX plan §4, R11)", () => {
  it("puts 'Pair it with' before the details/reviews and quotes the real zone ladder in the delivery card", async () => {
    const product = PRODUCTS.find((p) => p.slug === "heritage-green-panjabi")!;
    const { container } = await renderProduct("prosanti-direct", product.slug);

    const pair = container.querySelector('[data-testid="pair-it-with"]') as HTMLElement | null;
    const complements = (await import("@/lib/merchandising")).completeTheLook(product, PRODUCTS);
    if (complements.length === 0) {
      expect(pair).toBeNull();
    } else {
      expect(pair).not.toBeNull();
      const reviews = within(container).getByRole("heading", { name: /reviews/i });
      expect(pair!.compareDocumentPosition(reviews) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      // and above the details accordion
      const details = container.querySelector('[data-testid="product-info"], #product-info, [aria-label*="details" i]');
      if (details) expect(pair!.compareDocumentPosition(details) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      const cards = within(pair!).getAllByRole("article");
      expect(cards.length).toBeLessThanOrEqual(4);
      for (const card of cards) {
        expect(within(card).queryByRole("link", { name: `View ${product.name}` })).toBeNull();
      }
    }

    // the old hard-coded "from ৳30" / free-delivery promise is gone
    const aside = container.querySelector('[data-testid="delivery-aside"]') as HTMLElement;
    expect(aside).not.toBeNull();
    expect(aside.textContent).not.toContain("৳30");
    expect(aside.textContent).not.toMatch(/ফ্রি \(প্রতিটি কাস্টমারের জন্য\)/);
    expect(aside.textContent).toContain("৳60");
    expect(within(aside).getByRole("link", { name: /Delivery details/ })).toHaveAttribute("href", "/delivery");
  });
});
