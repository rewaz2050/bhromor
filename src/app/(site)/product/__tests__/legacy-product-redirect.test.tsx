/**
 * `/product/<slug>` after C5 (2026-09-29).
 *
 * The address every link out in the world still uses — WhatsApp forwards,
 * Facebook cards, printed QR codes. It must never die, but it is no longer the
 * piece's own address: it sends the visitor on with a 301. And when a name now
 * belongs to two shops, it asks instead of guessing.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, within } from "@testing-library/react";
import { CATEGORIES, PRODUCTS, type Product, type Shop } from "@/lib/catalog";
import { CartProvider } from "@/components/cart/cart-provider";
import { LanguageProvider } from "@/components/i18n/language-provider";

const shopA: Shop = {
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
};
const shopB: Shop = { ...shopA, id: "shop-2", slug: "second-shop", name: "Second Shop" };

const piece = (over: Partial<Product> & { id: string }): Product => ({
  ...PRODUCTS[0],
  name: "Cotton Panjabi",
  slug: "cotton-panjabi",
  ...over,
});

/** One name in two shops, one name in one shop, one orphaned piece. */
const CATALOG: Product[] = [
  piece({ id: "p1", slug: "cotton-panjabi", name: "Cotton Panjabi", shopId: "shop-1" }),
  piece({ id: "p2", slug: "cotton-panjabi", name: "Cotton Panjabi", shopId: "shop-2" }),
  piece({ id: "p3", slug: "only-here", name: "Only Here", shopId: "shop-1" }),
  piece({ id: "p4", slug: "orphan", name: "Orphan", shopId: "shop-9" }),
];

vi.mock("@/lib/db/storefront", () => ({
  getStorefrontCatalog: async () => ({
    products: CATALOG,
    categories: CATEGORIES,
    shops: [shopA, shopB],
    live: true,
  }),
  findStorefrontProductsBySlug: (products: Product[], slug: string) =>
    products.filter((p) => p.slug === slug),
}));

vi.mock("@/lib/db/also-bought", () => ({ alsoBoughtProducts: async () => [] }));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  permanentRedirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/product/only-here",
  useSearchParams: () => new URLSearchParams(),
}));

import LegacyProductPage from "../[slug]/page";

afterEach(cleanup);

const run = async (slug: string) =>
  LegacyProductPage({ params: Promise.resolve({ slug }) }).catch((error: Error) => error);

describe("/product/<slug> — the address links already use", () => {
  it("sends a unique old link on to the shop-scoped page permanently", async () => {
    const thrown = (await run("only-here")) as Error;
    expect(thrown.message).toBe("NEXT_REDIRECT:/shops/prosanti-direct/p/only-here");
  });

  it("asks which shop instead of guessing when two shops sell the name", async () => {
    const ui = await run("cotton-panjabi");
    expect(ui).not.toBeInstanceOf(Error);
    const view = render(ui as React.ReactElement);
    const ask = view.getByTestId("product-slug-ambiguous");
    const choices = within(ask).getAllByTestId("product-slug-choice");
    expect(choices.map((c) => c.getAttribute("href"))).toEqual([
      "/shops/prosanti-direct/p/cotton-panjabi",
      "/shops/second-shop/p/cotton-panjabi",
    ]);
  });

  it("answers a real 404 for a name nobody sells", async () => {
    const thrown = (await run("nothing-like-this")) as Error;
    expect(thrown.message).toBe("NEXT_NOT_FOUND");
  });

  it("keeps a piece reachable when its own shop is not on the storefront", async () => {
    // A suspended shop's piece was browseable before C5 and still is: there is
    // simply no shop address to send the visitor on to.
    const ui = await run("orphan");
    expect(ui).not.toBeInstanceOf(Error);
    const view = render(
      <LanguageProvider>
        <CartProvider>{ui as React.ReactElement}</CartProvider>
      </LanguageProvider>,
    );
    expect(view.container.textContent).toContain("Orphan");
  });
});
