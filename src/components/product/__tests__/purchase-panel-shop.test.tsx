/**
 * P2 #3 — the shop chip on the product page (blueprint §2.5: name, rating,
 * prep time). The rating is approved-review-backed shop data; a shop with
 * zero reviews shows no stars — never a seed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { PRODUCTS, type Shop } from "@/lib/catalog";

const state = vi.hoisted(() => ({ shops: [] as Shop[] }));

vi.mock("@/lib/use-live-catalog", async () => {
  const { CATEGORIES, PRODUCTS } = await import("@/lib/catalog");
  return {
    useLiveCatalog: () => ({
      products: PRODUCTS,
      categories: CATEGORIES,
      shops: state.shops,
      live: false,
      loading: false,
      liveCategories: CATEGORIES,
    }),
  };
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

import PurchasePanel from "@/components/product/purchase-panel";
import { CartProvider } from "@/components/cart/cart-provider";
import { LanguageProvider } from "@/components/i18n/language-provider";

const SHOP: Shop = {
  id: "shop-1",
  slug: "prosanti-direct",
  name: "PROSANTI Direct",
  phone: "01700000000",
  address: "Sunamganj",
  zoneIds: ["z1"],
  prepMinutes: 15,
  commissionPct: 15,
  status: "active",
  isOpen: true,
  ratingAvg: 4.6,
  ratingCount: 12,
};

const product = PRODUCTS.find((p) => p.inStock)!;

const renderPanel = (shops: Shop[]) => {
  state.shops = shops;
  return render(
    <LanguageProvider>
      <CartProvider>
        <PurchasePanel product={product} />
      </CartProvider>
    </LanguageProvider>,
  );
};

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  state.shops = [];
});

describe("Buy box — shop chip (P2 #3)", () => {
  it("shows the shop, its prep time and its real rating", async () => {
    renderPanel([SHOP]);
    await waitFor(() => {
      expect(screen.getByText("PROSANTI Direct")).toBeVisible();
    });
    expect(screen.getByText("Prepares in ~15 min")).toBeInTheDocument();
    expect(screen.getByText("★ 4.6 (12)")).toBeInTheDocument();
  });

  it("shows no stars for a shop with zero reviews — never a seed", async () => {
    renderPanel([{ ...SHOP, ratingAvg: 0, ratingCount: 0 }]);
    await waitFor(() => {
      expect(screen.getByText("PROSANTI Direct")).toBeVisible();
    });
    expect(screen.queryByText(/★/)).toBeNull();
  });
});
