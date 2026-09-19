import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import Home from "../page";
import { CartProvider } from "@/components/cart/cart-provider";
import { HOME_DEFAULTS } from "@/lib/home-cms";
import { __resetHomeSettings } from "@/lib/use-home-settings";
import { MY_ZONE_KEY } from "@/lib/use-my-zone";
import { CATEGORIES, DELIVERY_ZONES, PRODUCTS, type Shop } from "@/lib/catalog";

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

/** Launch shop #1 — the owner's own catalog, serving every zone. */
const launchShop = (): Shop => ({
  id: "shop-1",
  slug: "prosanti-direct",
  name: "PROSANTI Direct",
  phone: "01700000000",
  zoneIds: DELIVERY_ZONES.map((z) => z.id),
  prepMinutes: 15,
  commissionPct: 15,
  status: "active",
  isOpen: true,
  ratingAvg: 0,
  ratingCount: 0,
});

const originalFetch = globalThis.fetch;

let homepageSettings: unknown = HOME_DEFAULTS;

const mockFetch = (input: RequestInfo | URL) => {
  const url = String(input);
  if (url.includes("/api/products")) {
    return Promise.resolve(
      jsonResponse({
        source: "live",
        products: PRODUCTS,
        categories: CATEGORIES,
        shops: [launchShop()],
      }),
    );
  }
  if (url.includes("/api/zones")) {
    return Promise.resolve(jsonResponse({ source: "live", zones: DELIVERY_ZONES }));
  }
  if (url.includes("/api/homepage")) {
    return Promise.resolve(jsonResponse({ settings: homepageSettings }));
  }
  return Promise.resolve(jsonResponse({}));
};

beforeEach(() => {
  homepageSettings = HOME_DEFAULTS;
  // The homepage settings store is fetch-once per page lifetime (P2.2);
  // each test is a fresh page.
  __resetHomeSettings();
  globalThis.fetch = mockFetch as unknown as typeof fetch;
});

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
});

async function renderHome() {
  const view = render(
    <CartProvider>
      <Home />
    </CartProvider>,
  );
  // Flush the client live-catalog / zone / CMS probes so state updates stay
  // inside act and the test does not end with pending setState work.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return view;
}

describe("Homepage editorial journey", () => {
  it("renders the premium campaign headline and one collection CTA", async () => {
    await renderHome();

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: /rooted in tradition.*made for today/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /explore collection/i }),
    ).toHaveAttribute("href", "/shop");
    expect(screen.queryByRole("link", { name: /shop men/i })).toBeNull();
  });

  it("shows the categories block, without the retired featured edit", async () => {
    await renderHome();

    expect(
      await screen.findByRole("heading", {
        level: 2,
        name: "A wardrobe, thoughtfully composed.",
      }),
    ).toBeInTheDocument();
    // Batch K — the featured edit moved off the homepage; the whole shelf
    // below the categories already carries every piece.
    expect(
      screen.queryByRole("heading", { level: 2, name: "Featured." }),
    ).toBeNull();
    const links = screen.getAllByRole("link", { name: "Heritage Green Panjabi" });
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link).toHaveAttribute("href", "/product/heritage-green-panjabi");
    }
  });

  it("contains no launch-unsafe review proof or retired promo rails", async () => {
    await renderHome();

    expect(screen.queryByText(/demo review/i)).toBeNull();
    expect(screen.queryByRole("heading", { name: /under ৳500/i })).toBeNull();
    expect(
      screen.queryByRole("heading", { name: /dress for your kind of day/i }),
    ).toBeNull();
    expect(screen.queryByRole("heading", { name: /customer reviews/i })).toBeNull();
  });

  /* Batch K (2026-09-19) — the homepage opens with a compact hero, then the
     categories, then the offers, then every piece under its own category. */
  it("offers every category directly under the hero", async () => {
    await renderHome();
    const collections = document.getElementById("collections");
    expect(collections).not.toBeNull();
    const hrefs = within(collections!)
      .getAllByRole("link")
      .map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(
      expect.arrayContaining([
        "/shop?category=men",
        "/shop?category=women",
        "/shop?category=traditional",
      ]),
    );
    expect(hrefs).toContain("/shop");
    // The hero jumps straight to the categories.
    expect(
      screen.getByRole("link", { name: /shop by category/i }),
    ).toHaveAttribute("href", "#collections");
  });

  it("lists every published piece under its own category shelf", async () => {
    await renderHome();
    await screen.findByTestId("whole-shelf");
    const shelves = screen.getAllByTestId("category-shelf");
    const ids = shelves.map((s) => s.getAttribute("data-category"));
    expect(ids).toEqual(["men", "women", "traditional"]);
    const seen = new Set<string>();
    for (const shelf of shelves) {
      const cat = shelf.getAttribute("data-category");
      for (const card of within(shelf).getAllByRole("article")) {
        const product = PRODUCTS.find((p) =>
          within(card).queryByRole("link", { name: p.name }),
        );
        expect(product).toBeDefined();
        expect(product!.category).toBe(cat);
        seen.add(product!.id);
      }
    }
    const visible = PRODUCTS.filter((p) => p.active !== false && p.status !== "draft");
    expect([...seen].sort()).toEqual(visible.map((p) => p.id).sort());
    // Each shelf heading is itself the category link.
    expect(
      within(shelves[0]).getByRole("heading", { level: 2, name: "Men" }).closest("a"),
    ).toHaveAttribute("href", "/shop?category=men");
  });

  it("says 'no shop delivers there' (with a reset) instead of 'being stocked' for an unserved zone", async () => {
    window.localStorage.setItem(MY_ZONE_KEY, "zone-nowhere");
    try {
      await renderHome();
      const empty = await screen.findByTestId("whole-shelf-empty");
      expect(within(empty).getByRole("heading", { level: 2 })).toHaveTextContent(
        /no shops deliver there yet/i,
      );
      expect(screen.queryByTestId("category-shelf")).toBeNull();
      fireEvent.click(within(empty).getByRole("button", { name: /show all zones/i }));
      expect(await screen.findByTestId("whole-shelf")).toBeInTheDocument();
      expect(screen.getAllByTestId("category-shelf").length).toBeGreaterThan(0);
    } finally {
      window.localStorage.removeItem(MY_ZONE_KEY);
    }
  });

  it("follows hero → categories → shelf → para check → trust", async () => {
    const { container } = await renderHome();
    await screen.findByTestId("whole-shelf");
    const selectors = [
      ".compact-hero",
      "#collections",
      '[data-testid="category-shelf"]',
      '[data-testid="home-delivery-check"]',
      '[aria-label="PROSANTI service promises"]',
    ];
    const positions = selectors.map((selector) => {
      const node = container.querySelector(selector);
      expect(node).not.toBeNull();
      return Array.from(container.querySelectorAll("section")).indexOf(
        node as HTMLElement,
      );
    });
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it("retains CMS hero copy and visibility controls in the compact layout", async () => {
    homepageSettings = {
      ...HOME_DEFAULTS,
      hero: {
        ...HOME_DEFAULTS.hero,
        title1: "Thoughtfully made",
        title2: "for you.",
      },
      sections: { ...HOME_DEFAULTS.sections, collections: false },
    };

    await renderHome();

    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Thoughtfully made for you.",
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", {
        name: "A wardrobe, thoughtfully composed.",
      }),
    ).toBeNull();
    // Without the categories block the shelf still carries the pieces.
    expect(await screen.findByTestId("whole-shelf")).toBeInTheDocument();
  });

  it("links service promises to real pages", async () => {
    await renderHome();

    expect(screen.getByRole("link", { name: "Easy Returns" })).toHaveAttribute(
      "href",
      "/returns",
    );
    expect(screen.getByRole("link", { name: "Cash on Delivery" })).toHaveAttribute(
      "href",
      "/faq",
    );
  });
});
