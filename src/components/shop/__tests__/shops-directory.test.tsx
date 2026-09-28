/** UX plan §9 (R8) — a shop card you can see into, and a zone answer both ways. */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import ShopsDirectory from "@/components/shop/shops-directory";
import { LanguageProvider } from "@/components/i18n/language-provider";
import { CATEGORIES, DELIVERY_ZONES, PRODUCTS, type Product, type Shop } from "@/lib/catalog";
import { shopShelfPeeks } from "@/lib/home-shelves";
import { MY_ZONE_KEY } from "@/lib/use-my-zone";

const shop = (over: Partial<Shop>): Shop => ({
  id: "s1",
  slug: "s1",
  name: "Shop One",
  phone: "01711111111",
  zoneIds: ["z1", "z2"],
  prepMinutes: 15,
  commissionPct: 10,
  status: "active",
  isOpen: true,
  ratingAvg: 4.6,
  ratingCount: 12,
  ...over,
});

const SHOPS = [
  shop({}),
  shop({ id: "s2", slug: "s2", name: "Shop Two", zoneIds: ["z3"], ratingCount: 0, prepMinutes: 25 }),
];

const CATALOG: Product[] = [
  { ...PRODUCTS[0], shopId: "s1", category: "men" },
  { ...PRODUCTS[1], shopId: "s1", category: "women" },
  { ...PRODUCTS[2], shopId: "s2", category: "men" },
];

const mount = (lang: "en" | "bn" = "bn") =>
  render(
    <LanguageProvider initialLang={lang}>
      <ShopsDirectory
        shops={SHOPS}
        zones={DELIVERY_ZONES}
        categories={CATEGORIES}
        productCounts={{ s1: 7, s2: 3 }}
        peeks={{ s1: PRODUCTS.slice(0, 3), s2: PRODUCTS.slice(3, 4) }}
        catalog={CATALOG}
      />
    </LanguageProvider>,
  );

beforeEach(() => {
  localStorage.clear();
  document.cookie = "prosanti-lang=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
});
afterEach(cleanup);

describe("shopShelfPeeks", () => {
  it("gives each shop its best-selling, in-stock, discoverable pieces — at most three", () => {
    const pool = PRODUCTS.map((p, i) => ({
      ...p,
      shopId: i % 2 ? "b" : "a",
      unitsSold: i,
      inStock: i !== 6,
    }));
    const peeks = shopShelfPeeks(pool, "a");
    expect(peeks.a.length).toBeLessThanOrEqual(3);
    expect(peeks.b.length).toBeLessThanOrEqual(3);
    // Highest unitsSold first; the sold-out index 6 (shop a) never appears.
    expect(peeks.a.map((p) => p.unitsSold)).toEqual([...peeks.a.map((p) => p.unitsSold)].sort((x, y) => y! - x!));
    expect(peeks.a.some((p) => !p.inStock)).toBe(false);
    // A product without shopId falls back to the fallback shop.
    const orphan = shopShelfPeeks([{ ...PRODUCTS[0], shopId: undefined }], "fallback");
    expect(Object.keys(orphan)).toEqual(["fallback"]);
  });
});

describe("<ShopsDirectory> cards", () => {
  it("shows a three-thumbnail peek into the shop, counts in Bengali digits", () => {
    mount();
    const cards = screen.getAllByTestId("shop-card");
    expect(cards).toHaveLength(2);
    const peek = within(cards[0]).getByTestId("shop-peek");
    expect(peek).toHaveAttribute("href", "/shops/s1");
    expect(peek.querySelectorAll("img")).toHaveLength(3);
    expect(cards[0].textContent).toContain("৭");
    expect(cards[0].textContent).toContain("১৫");
    expect(cards[0].textContent).toContain("৪.৬");
    expect(cards[0].textContent).not.toMatch(/[0-9]/);
    // Without a picked zone there is neither a tick nor a warning.
    expect(screen.queryByTestId("shop-serves-zone")).toBeNull();
  });

  it("with a zone picked: tick for a shop that delivers there, honest badge for one that does not, serving shops first", () => {
    localStorage.setItem(MY_ZONE_KEY, "z3");
    mount("en");
    const cards = screen.getAllByTestId("shop-card");
    // s2 serves z3 → floats to the top with the tick.
    expect(within(cards[0]).getByRole("heading", { level: 2 }).textContent).toBe("Shop Two");
    expect(within(cards[0]).getByTestId("shop-serves-zone").textContent).toMatch(/Delivers to your area/);
    expect(cards[1].textContent).toMatch(/Doesn't deliver to your zone/);
    expect(within(cards[1]).queryByTestId("shop-serves-zone")).toBeNull();
  });
});

describe("shop cover image (UX plan §9, R9)", () => {
  it("shows a banner only for shops that set a cover, leaving the rest unchanged", () => {
    render(
      <LanguageProvider initialLang="bn">
        <ShopsDirectory
          shops={[shop({ coverUrl: "https://cdn.example/cover.jpg" }), shop({ id: "s2", slug: "s2", name: "Shop Two" })]}
          zones={DELIVERY_ZONES}
          productCounts={{ s1: 7, s2: 3 }}
          peeks={{ s1: PRODUCTS.slice(0, 3), s2: PRODUCTS.slice(3, 4) }}
        />
      </LanguageProvider>,
    );
    const cards = screen.getAllByTestId("shop-card");
    expect(cards[0].dataset.cover).toBe("1");
    expect(cards[0].querySelector('[data-testid="shop-card-cover"]')?.getAttribute("src")).toBe("https://cdn.example/cover.jpg");
    expect(cards[1].dataset.cover).toBeUndefined();
    expect(cards[1].querySelector('[data-testid="shop-card-cover"]')).toBeNull();
  });
});

describe("A1 — search, sort and filters", () => {
  const searchBox = () => screen.getByRole("searchbox");

  it("filters cards by shop name as the shopper types, and says how many matched", () => {
    mount("en");
    fireEvent.change(searchBox(), { target: { value: "two" } });
    const cards = screen.getAllByTestId("shop-card");
    expect(cards).toHaveLength(1);
    expect(within(cards[0]).getByRole("heading", { level: 2 }).textContent).toBe("Shop Two");
    expect(screen.getByTestId("shops-count").textContent).toContain("1 of 2 shops");
  });

  it("offers a chip per stocked category and filters by it", () => {
    mount("en");
    // "Women" is stocked by s1 only; the all-chip is the default.
    fireEvent.click(screen.getByRole("button", { name: "Women" }));
    const cards = screen.getAllByTestId("shop-card");
    expect(cards).toHaveLength(1);
    expect(within(cards[0]).getByRole("heading", { level: 2 }).textContent).toBe("Shop One");
    expect(screen.getByRole("button", { name: "Women" })).toHaveAttribute("aria-pressed", "true");
  });

  it("shows an honest empty tab with a one-tap way back to every shop", () => {
    mount("en");
    fireEvent.change(searchBox(), { target: { value: "no such shop" } });
    expect(screen.queryAllByTestId("shop-card")).toHaveLength(0);
    const empty = screen.getByTestId("shops-empty");
    expect(empty.textContent).toContain("No shop matches that");
    fireEvent.click(within(empty).getByRole("button", { name: "Clear filters" }));
    expect(screen.getAllByTestId("shop-card")).toHaveLength(2);
    expect((searchBox() as HTMLInputElement).value).toBe("");
  });

  it("the area toggle stays disabled until a zone is picked — and never hides shops silently", () => {
    mount("en");
    const toggle = screen.getByRole("checkbox") as HTMLInputElement;
    expect(toggle).toBeDisabled();
    expect(screen.getByText("Pick your area to filter")).toBeInTheDocument();

    cleanup();
    localStorage.setItem(MY_ZONE_KEY, "z3");
    mount("en");
    const armed = screen.getByRole("checkbox") as HTMLInputElement;
    expect(armed).not.toBeDisabled();
    expect(screen.getByText(/Delivers to Zone C/)).toBeInTheDocument();
    fireEvent.click(armed);
    // s1 does not serve z3 → one card left, and the count says one is hidden.
    expect(screen.getAllByTestId("shop-card")).toHaveLength(1);
    expect(screen.getByTestId("shops-count").textContent).toContain("1 hidden — not delivering here");
  });

  it("sorts by the biggest shelf on request", () => {
    mount("en");
    fireEvent.click(screen.getByRole("button", { name: "Biggest shelf" }));
    const cards = screen.getAllByTestId("shop-card");
    expect(within(cards[0]).getByRole("heading", { level: 2 }).textContent).toBe("Shop One");
    expect(within(cards[1]).getByRole("heading", { level: 2 }).textContent).toBe("Shop Two");
  });
});
