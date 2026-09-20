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

  it("is a short hero — no poster, no browse chips inside it", async () => {
    await renderHome();
    const hero = screen.getByTestId("home-hero");
    expect(hero.querySelector(".cinematic-hero")).toBeNull();
    expect(hero).not.toHaveClass("cinematic-hero");
    expect(within(hero).queryByTestId("browse-chips")).toBeNull();
    // Exactly one CTA (to the shop) and one anchor down to the shelf.
    expect(within(hero).getByRole("link", { name: /explore collection/i })).toHaveAttribute(
      "href",
      "/shop",
    );
    expect(within(hero).getByRole("link", { name: /browse the shelf/i })).toHaveAttribute(
      "href",
      "#shelf",
    );
  });

  it("contains no launch-unsafe review proof or retired promo rails", async () => {
    await renderHome();

    expect(screen.queryByText(/demo review/i)).toBeNull();
    expect(screen.queryByRole("heading", { name: /under ৳500/i })).toBeNull();
    expect(
      screen.queryByRole("heading", { name: /dress for your kind of day/i }),
    ).toBeNull();
    expect(screen.queryByRole("heading", { name: /customer reviews/i })).toBeNull();
    // 2026-09-20 — the collections poster grid, the "Featured." edit and
    // the curated rails left the homepage; the shelf below carries every piece.
    expect(
      screen.queryByRole("heading", { name: "A wardrobe, thoughtfully composed." }),
    ).toBeNull();
    expect(screen.queryByRole("heading", { name: "Featured." })).toBeNull();
    expect(screen.queryByTestId("rail-new")).toBeNull();
    expect(screen.queryByTestId("rail-best")).toBeNull();
  });

  /* 2026-09-20 — directly under the hero: one tile per category with
     pieces, in category order, each a link into the filtered shop. */
  it("shows the category row under the hero, one tile per stocked category", async () => {
    await renderHome();
    const row = await screen.findByTestId("category-row");
    const tiles = within(row).getAllByTestId("category-tile");
    expect(tiles.map((t) => t.getAttribute("data-category"))).toEqual([
      "men",
      "women",
      "traditional",
    ]);
    const men = within(tiles[0]).getByRole("link");
    expect(men).toHaveAttribute("href", "/shop?category=men");
    expect(men).toHaveTextContent("Men");
    expect(men).toHaveTextContent("3 pieces");
    expect(within(tiles[1]).getByRole("link")).toHaveAttribute("href", "/shop?category=women");
    expect(within(row).getByRole("link", { name: /all pieces/i })).toHaveAttribute(
      "href",
      "/shop",
    );
    // The header's "Collections" link (/#collections) lands on this row.
    expect(row).toHaveAttribute("id", "collections");
  });

  /* 2026-09-20 — offers sit between the category row and the shelf: every
     piece with a struck-through price, biggest saving first, and a "See all
     N offers" link into the ?filter=sale shop. */
  it("lists the marked-down pieces in the offers rail, biggest saving first", async () => {
    await renderHome();
    const rail = await screen.findByTestId("rail-offers");
    expect(
      within(rail).getByRole("heading", { level: 2, name: "On offer right now" }),
    ).toBeInTheDocument();
    const cards = within(rail).getAllByRole("article");
    const names = cards.map(
      (card) => within(card).getAllByRole("link")[0].getAttribute("aria-label"),
    );
    const onOffer = PRODUCTS.filter(
      (p) => p.active !== false && p.status !== "draft" && (p.compareAtPrice ?? 0) > p.price,
    );
    expect(onOffer.length).toBeGreaterThan(1);
    // 22% off (Slate Premium T-Shirt) before 19% off (Heritage Green Panjabi).
    expect(names).toEqual(["View Slate Premium T-Shirt", "View Heritage Green Panjabi"]);
    expect(within(rail).getByRole("link", { name: /see all 2 offers/i })).toHaveAttribute(
      "href",
      "/shop?filter=sale",
    );
    // No flash window is running in the test clock → no drop rail.
    expect(screen.queryByTestId("flash-rail")).toBeNull();
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

  it("follows hero → categories → offers → shelf → delivery check → trust", async () => {
    const { container } = await renderHome();
    await screen.findByTestId("whole-shelf");
    const selectors = [
      '[data-testid="home-hero"]',
      '[data-testid="category-row"]',
      "#offers-rail",
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

  it("retains CMS hero copy and visibility controls in the shorter layout", async () => {
    homepageSettings = {
      ...HOME_DEFAULTS,
      hero: {
        ...HOME_DEFAULTS.hero,
        title1: "Thoughtfully made",
        title2: "for you.",
      },
      sections: { ...HOME_DEFAULTS.sections, collections: false, offers: false },
    };

    await renderHome();

    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Thoughtfully made for you.",
      }),
    ).toBeInTheDocument();
    // Hidden by the CMS: the category row and the offers block…
    expect(screen.queryByTestId("category-row")).toBeNull();
    expect(screen.queryByTestId("rail-offers")).toBeNull();
    // …while the shelf itself is not a toggle — it is the page.
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
