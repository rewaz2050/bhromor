import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import PurchasePanel from "../purchase-panel";
import ShopHero from "@/components/shop/shop-hero";
import { CartProvider } from "@/components/cart/cart-provider";
import { LanguageProvider } from "@/components/i18n/language-provider";
import { PRODUCTS, type Shop } from "@/lib/catalog";
import { __resetPromos } from "@/lib/use-promos";
import { __resetSizeProfile } from "@/lib/size-finder";
import { __resetPriceWatch } from "@/lib/price-drop";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

const shopWithPhone: Shop = {
  id: "shop-1",
  slug: "prosanti-direct",
  name: "PROSANTI Direct",
  phone: "01712345678",
  zoneIds: ["z1", "z2", "z3", "z4"],
  prepMinutes: 15,
  commissionPct: 15,
  status: "active",
  isOpen: true,
  ratingAvg: 0,
  ratingCount: 0,
};

const shopNoPhone: Shop = { ...shopWithPhone, phone: "" };

let currentShop: Shop = shopWithPhone;

vi.mock("@/lib/use-live-catalog", async () => {
  const { CATEGORIES, PRODUCTS } = await import("@/lib/catalog");
  return {
    useLiveCatalog: () => ({
      products: PRODUCTS,
      categories: CATEGORIES,
      shops: [currentShop],
      live: false,
      loading: false,
      liveCategories: CATEGORIES,
    }),
  };
});

/** The promo store fetches /api/promo; nothing is running in this test. */
vi.stubGlobal(
  "fetch",
  vi.fn(() =>
    Promise.resolve(
      new Response(
        JSON.stringify({
          source: "none",
          promos: null,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    ),
  ),
);

const product = PRODUCTS.find(
  (p) => p.slug === "heritage-green-panjabi" && p.inStock,
)!;

const renderPanel = () =>
  render(
    <LanguageProvider>
      <CartProvider>
        <PurchasePanel product={product} />
      </CartProvider>
    </LanguageProvider>,
  );

beforeEach(() => {
  localStorage.clear();
  currentShop = shopWithPhone;
  __resetPromos();
  __resetSizeProfile();
  __resetPriceWatch();
});

afterEach(() => {
  cleanup();
  __resetPromos();
});

describe("purchase panel — WhatsApp order (P1 #15)", () => {
  it("offers a pre-filled wa.me link with the product details", async () => {
    renderPanel();
    const link = await screen.findByTestId("whatsapp-order");
    const href = link.getAttribute("href") ?? "";
    expect(href).toMatch(/^https:\/\/wa\.me\/8801712345678\?text=/);
    const text = decodeURIComponent(new URL(href).searchParams.get("text") ?? "");
    expect(text).toContain("PROSANTI Direct");
    expect(text).toContain(product.name);
    expect(text).toContain("cash on delivery");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByText("Order on WhatsApp")).toBeInTheDocument();
  });

  it("shows no WhatsApp button when the shop has no plausible mobile", async () => {
    currentShop = shopNoPhone;
    renderPanel();
    // Let the promo fetch settle so "no button" is a real answer, not a first paint.
    await new Promise((r) => setTimeout(r, 100));
    expect(screen.queryByTestId("whatsapp-order")).toBeNull();
  });
});

describe("shop hero — Chat on WhatsApp (P1 #15)", () => {
  it("renders the chat link for a shop with a mobile number", () => {
    render(
      <LanguageProvider>
        <ShopHero shop={shopWithPhone} zoneNames={["Zone A"]} />
      </LanguageProvider>,
    );
    const link = screen.getByTestId("whatsapp-shop-chat");
    expect(link.getAttribute("href") ?? "").toMatch(
      /^https:\/\/wa\.me\/8801712345678\?text=/,
    );
    expect(link).toHaveTextContent("Chat on WhatsApp");
  });

  it("renders nothing when the shop has no number", () => {
    render(
      <LanguageProvider>
        <ShopHero shop={shopNoPhone} zoneNames={["Zone A"]} />
      </LanguageProvider>,
    );
    expect(screen.queryByTestId("whatsapp-shop-chat")).toBeNull();
  });
});
