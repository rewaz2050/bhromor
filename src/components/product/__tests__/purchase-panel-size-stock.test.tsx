/**
 * UX plan §4 (R10) — per-size stock on the product page:
 *   • a sold-out size is greyed + struck through but still tappable
 *   • tapping it opens the "this size is gone" panel (other sizes, WhatsApp
 *     ask) and the CTA says so instead of adding
 *   • a low size whispers "N left"
 *   • the saved-body pre-select never lands on a sold-out size
 *   • the quick-add sheet disables the sold-out size outright
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import PurchasePanel from "@/components/product/purchase-panel";
import QuickAdd from "@/components/product/quick-add";
import { CartProvider } from "@/components/cart/cart-provider";
import { LanguageProvider } from "@/components/i18n/language-provider";
import { CATEGORIES, PRODUCTS, type Product } from "@/lib/catalog";
import { __resetLiveCatalog, __serveLiveCatalogForTests } from "@/lib/live-catalog";
import { __resetSizeProfile, saveSizeProfile } from "@/lib/size-finder";
import { __resetPromos } from "@/lib/use-promos";

const base = PRODUCTS.find((p) => p.sizes.length >= 3 && p.inStock)!;
const [outSize, lowSize, okSize] = base.sizes;
const product: Product = {
  ...base,
  sizeStock: Object.fromEntries(base.sizes.map((s, i) => [s, i === 0 ? 0 : i === 1 ? 2 : 8])),
};
const shop = {
  id: "shop-1",
  slug: "shop-1",
  name: "Test Shop",
  phone: "01711111111",
  zoneIds: ["z1"],
  prepMinutes: 15,
  commissionPct: 10,
  status: "active" as const,
  isOpen: true,
  ratingAvg: 0,
  ratingCount: 0,
  createdAt: 0,
};

vi.mock("@/lib/use-live-catalog", async () => {
  const { CATEGORIES } = await import("@/lib/catalog");
  return {
    useLiveCatalog: () => ({
      products: [product],
      categories: CATEGORIES,
      shops: [shop],
      live: true,
      loading: false,
      liveCategories: CATEGORIES,
    }),
  };
});
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

const mount = (lang: "en" | "bn" = "en") =>
  render(
    <LanguageProvider initialLang={lang}>
      <CartProvider>
        <PurchasePanel product={product} />
      </CartProvider>
    </LanguageProvider>,
  );

const chip = (size: string) =>
  screen
    .getAllByRole("button")
    .find((b) => b.hasAttribute("data-size-fit") && (b.textContent ?? "").trim().startsWith(size))!;

beforeEach(() => {
  localStorage.clear();
  document.cookie = "prosanti-lang=; max-age=0; path=/";
  __resetPromos();
  __resetSizeProfile();
  __serveLiveCatalogForTests([product], CATEGORIES);
  vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response(JSON.stringify({}), { status: 200 }))));
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
  __resetPromos();
  __resetSizeProfile();
  __resetLiveCatalog();
  vi.unstubAllGlobals();
});

describe("Buy box — per-size stock (UX plan §4, R10)", () => {
  it("greys the sold-out size, whispers the low one, leaves the rest plain", async () => {
    mount("bn");
    await screen.findByTestId("size-row");
    expect(chip(outSize).dataset.sizeStock).toBe("out");
    expect(chip(outSize).getAttribute("aria-label")).toContain(outSize);
    expect(chip(lowSize).dataset.sizeStock).toBe("low");
    expect(chip(lowSize).querySelector('[data-testid="size-left"]')?.textContent).toBe("২টি বাকি");
    expect(chip(okSize).dataset.sizeStock).toBe("ok");
    expect(chip(okSize).querySelector('[data-testid="size-left"]')).toBeNull();
    expect(screen.queryByTestId("size-sold-out")).toBeNull();
  });

  it("a tap on the sold-out size opens the panel with the other sizes and a WhatsApp ask; the CTA refuses to add", async () => {
    mount("en");
    await screen.findByTestId("size-row");
    fireEvent.click(chip(outSize));
    const panel = await screen.findByTestId("size-sold-out");
    expect(panel.textContent).toContain(`Size ${outSize} is gone for now.`);
    const alts = panel.querySelectorAll('[data-testid="size-alt"]');
    expect([...alts].map((a) => a.textContent)).toEqual(base.sizes.filter((s) => s !== outSize));
    const wa = panel.querySelector('[data-testid="size-ask-whatsapp"]') as HTMLAnchorElement;
    expect(wa.href).toContain("wa.me");
    expect(decodeURIComponent(wa.href)).toContain(`size ${outSize} of "${product.name}"`);
    const ctas = screen.getAllByRole("button", { name: `Size ${outSize} is sold out` });
    expect(ctas.length).toBeGreaterThanOrEqual(1);
    for (const cta of ctas) expect(cta).toBeDisabled();
    // picking another size from the panel clears it and re-arms the CTA
    fireEvent.click(alts[1]);
    await waitFor(() => expect(screen.queryByTestId("size-sold-out")).toBeNull());
    expect(screen.getAllByRole("button", { name: "Add to Bag" }).length).toBeGreaterThanOrEqual(1);
  });

  it("never pre-selects a sold-out size from the saved body", async () => {
    // A profile whose recommendation is the (sold-out) first size → nothing picked.
    saveSizeProfile({ heightCm: 150, weightKg: 45, fit: "regular" });
    mount("en");
    await screen.findByTestId("size-row");
    await waitFor(() => expect(chip(outSize).getAttribute("aria-pressed")).toBe("false"));
    expect(screen.queryByTestId("size-sold-out")).toBeNull();
  });
});

describe("Quick add — per-size stock", () => {
  it("disables the sold-out size and whispers the low one", () => {
    render(
      <LanguageProvider initialLang="en">
        <CartProvider>
          <QuickAdd product={product} onClose={() => undefined} />
        </CartProvider>
      </LanguageProvider>,
    );
    const buttons = screen.getAllByRole("button").filter((b) => b.hasAttribute("data-size-stock"));
    const out = buttons.find((b) => b.dataset.sizeStock === "out")!;
    expect(out).toBeDisabled();
    const low = buttons.find((b) => b.dataset.sizeStock === "low")!;
    expect(low.textContent).toContain("2 left");
  });
});
