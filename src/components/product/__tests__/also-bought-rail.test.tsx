/** UX plan §4 (R11) — the co-purchase rail: two pieces minimum, Bengali heading, cards link to the pieces. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import AlsoBoughtRail from "@/components/product/also-bought-rail";
import { CartProvider } from "@/components/cart/cart-provider";
import { LanguageProvider } from "@/components/i18n/language-provider";
import { PRODUCTS } from "@/lib/catalog";

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

afterEach(cleanup);

const mount = (items: typeof PRODUCTS, lang: "en" | "bn" = "bn") =>
  render(
    <LanguageProvider initialLang={lang}>
      <CartProvider>
        <AlsoBoughtRail items={items} />
      </CartProvider>
    </LanguageProvider>,
  );

describe("<AlsoBoughtRail>", () => {
  it("shows up to four co-purchased pieces under a Bengali heading", () => {
    mount(PRODUCTS.slice(0, 6));
    const rail = screen.getByTestId("also-bought");
    expect(within(rail).getByRole("heading", { name: "এটার সাথে অন্যরা কিনেছেন" })).toBeInTheDocument();
    const hrefs = within(rail).getAllByTestId("card-peek").map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(PRODUCTS.slice(0, 4).map((p) => `/product/${p.slug}`));
  });

  it("renders nothing for fewer than two pieces", () => {
    mount(PRODUCTS.slice(0, 1), "en");
    expect(screen.queryByTestId("also-bought")).toBeNull();
  });
});
