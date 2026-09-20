/**
 * Product page tail (2026-09-20): the LAST section of a product page is the
 * rest of the piece's own category — nothing from other categories, never
 * the piece itself — and it sits below the reviews.
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
  findStorefrontProduct: (products: typeof PRODUCTS, slug: string) =>
    products.find((p) => p.slug === slug) ?? null,
}));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/product/heritage-green-panjabi",
  useSearchParams: () => new URLSearchParams(),
}));

import ProductPage from "../[slug]/page";
import { CartProvider } from "@/components/cart/cart-provider";
import { LanguageProvider } from "@/components/i18n/language-provider";

const originalFetch = globalThis.fetch;

beforeEach(() => {
  // Every client probe on the page (reviews, promos, zones…) answers empty.
  globalThis.fetch = (() =>
    Promise.resolve(new Response(JSON.stringify({}), { status: 200 }))) as unknown as typeof fetch;
});

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
});

async function renderProduct(slug: string) {
  const ui = await ProductPage({ params: Promise.resolve({ slug }) });
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
    const { container } = await renderProduct(product.slug);

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
  });
});
