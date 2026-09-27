/** UX plan §10 (R7) — Style Match promoted on home and remembered per device. */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import YourStyleRail, { yourStylePicks } from "@/components/home/your-style-rail";
import { CartProvider } from "@/components/cart/cart-provider";
import { LanguageProvider } from "@/components/i18n/language-provider";
import { PRODUCTS, type Product } from "@/lib/catalog";
import { __resetStyleMemoryForTests, saveStyleQuery } from "@/lib/style-memory";

const mount = (pool: Product[], lang: "en" | "bn" = "bn") =>
  render(
    <LanguageProvider initialLang={lang}>
      <CartProvider>
        <YourStyleRail pool={pool} />
      </CartProvider>
    </LanguageProvider>,
  );

beforeEach(() => {
  localStorage.clear();
  document.cookie = "prosanti-lang=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
  __resetStyleMemoryForTests();
});
afterEach(cleanup);

describe("yourStylePicks", () => {
  it("keeps Style Match's ranking but lets new pieces lead among equals, never sold out", () => {
    const base = PRODUCTS.find((p) => p.subCategory === "Panjabi")!;
    const old = { ...base, id: "old", slug: "old", name: "Old Panjabi", isNew: false, inStock: true };
    const fresh = { ...base, id: "fresh", slug: "fresh", name: "Fresh Panjabi", isNew: true, inStock: true };
    const gone = { ...base, id: "gone", slug: "gone", name: "Gone Panjabi", isNew: true, inStock: false };
    const picks = yourStylePicks([old, gone, fresh], { occasion: "eid" });
    expect(picks.map((p) => p.id)).toEqual(["fresh", "old"]);
  });
});

describe("<YourStyleRail>", () => {
  it("invites a first-time device to Style Match in three taps (Bengali digits)", () => {
    mount(PRODUCTS);
    const invite = screen.getByTestId("your-style-invite");
    expect(within(invite).getByRole("link", { name: /Style Match/ })).toHaveAttribute("href", "/style");
    expect(invite.textContent).toContain("৩");
    expect(invite.textContent).not.toMatch(/[0-9]/);
    expect(screen.queryByTestId("rail-your-style")).toBeNull();
  });

  it("renders the remembered style as a rail with the occasion named, linking back to /style", () => {
    saveStyleQuery({ occasion: "eid", budgetTaka: null, colors: [], size: null, categoryId: null });
    mount(PRODUCTS, "en");
    const rail = screen.getByTestId("rail-your-style");
    expect(rail.textContent).toContain("Eid & family gatherings");
    expect(within(rail).getByRole("link", { name: /Refine in Style Match/ })).toHaveAttribute("href", "/style");
    const hrefs = within(rail)
      .getAllByTestId("card-peek")
      .map((a) => a.getAttribute("href"));
    expect(hrefs.length).toBeGreaterThanOrEqual(2);
    // Eid maps to panjabi / three-piece / gamcha — a plain shirt must not sneak in.
    const shirt = PRODUCTS.find((p) => p.subCategory === "Shirts")!;
    expect(hrefs).not.toContain(`/product/${shirt.slug}`);
    expect(screen.queryByTestId("your-style-invite")).toBeNull();
  });

  it("stays silent (no invite, no rail) when the remembered style finds fewer than two pieces", () => {
    saveStyleQuery({ occasion: null as never, budgetTaka: 1, colors: [], size: null, categoryId: null });
    mount(PRODUCTS);
    expect(screen.queryByTestId("rail-your-style")).toBeNull();
    expect(screen.queryByTestId("your-style-invite")).toBeNull();
  });
});
