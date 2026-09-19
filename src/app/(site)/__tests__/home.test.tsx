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

  it("shows collections and a restrained featured edit", async () => {
    await renderHome();

    expect(
      await screen.findByRole("heading", {
        level: 2,
        name: "A wardrobe, thoughtfully composed.",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: "Featured." }),
    ).toBeInTheDocument();
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

  /* Batch J (2026-09-19) — the homepage is the shelf: chips name every
     category on the first screen, and every published piece appears under
     its category further down. */
  it("names every category (and the curated paths) on the first screen", async () => {
    await renderHome();
    const chips = await screen.findByTestId("browse-chips");
    const names = within(chips).getAllByRole("link").map((a) => a.textContent);
    expect(names).toEqual(
      expect.arrayContaining(["Men", "Women", "Traditional", "New arrivals", "All pieces"]),
    );
    expect(within(chips).getByRole("link", { name: "Men" })).toHaveAttribute(
      "href",
      "/shop?category=men",
    );
    expect(within(chips).getByRole("link", { name: "New arrivals" })).toHaveAttribute(
      "href",
      "/shop?sort=newest",
    );
    // Launch seeds carry no real sales → no "Best sellers" chip, no rail.
    expect(within(chips).queryByRole("link", { name: "Best sellers" })).toBeNull();
    expect(screen.queryByTestId("rail-best")).toBeNull();
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

  it("has a new-arrivals rail that deep-links to the sorted shop", async () => {
    await renderHome();
    const rail = await screen.findByTestId("rail-new");
    expect(within(rail).getByRole("heading", { level: 2, name: "New arrivals" })).toBeInTheDocument();
    expect(within(rail).getByRole("link", { name: /see all new arrivals/i })).toHaveAttribute(
      "href",
      "/shop?sort=newest",
    );
    // in-stock pieces only
    for (const card of within(rail).getAllByRole("article")) {
      expect(within(card).queryByText(/sold out/i)).toBeNull();
    }
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

  it("follows hero → rails → collections → featured → shelf → trust", async () => {
    const { container } = await renderHome();
    await screen.findByTestId("whole-shelf");
    const selectors = [
      ".cinematic-hero",
      "#new-arrivals",
      "#collections",
      "#featured",
      '[data-testid="category-shelf"]',
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

  it("retains CMS hero copy and visibility controls in the shorter layout", async () => {
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
    expect(
      await screen.findByRole("heading", { name: "Featured." }),
    ).toBeVisible();
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
