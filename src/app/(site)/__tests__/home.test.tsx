import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import Home from "../home-client";
import { CartProvider } from "@/components/cart/cart-provider";
import { HOME_DEFAULTS } from "@/lib/home-cms";
import { __resetHomeSettings } from "@/lib/use-home-settings";
import { MY_ZONE_KEY } from "@/lib/use-my-zone";
import { CATEGORIES, DELIVERY_ZONES, PRODUCTS, type Shop } from "@/lib/catalog";
import { __resetRecentlyViewed, recordView } from "@/lib/recently-viewed";

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
let reviewsPayload: unknown = {};

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
  if (url.includes("/api/reviews")) {
    return Promise.resolve(jsonResponse(reviewsPayload));
  }
  return Promise.resolve(jsonResponse({}));
};

beforeEach(() => {
  homepageSettings = HOME_DEFAULTS;
  reviewsPayload = {};
  localStorage.removeItem("prosanti.recently-viewed.v1");
  __resetRecentlyViewed();
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

  it("shows a compact recently-viewed strip between hero and categories for a returning device only", async () => {
    let { container } = await renderHome();
    await screen.findByTestId("category-row");
    expect(screen.queryByTestId("recently-viewed-strip")).toBeNull();

    cleanup();
    __resetHomeSettings();
    const seen = PRODUCTS.filter((p) => p.active !== false && p.status !== "draft").slice(0, 2);
    recordView(seen[0].id, Date.now() - 2000);
    recordView(seen[1].id, Date.now() - 1000);
    ({ container } = await renderHome());
    const strip = await screen.findByTestId("recently-viewed-strip");
    const links = within(strip).getAllByRole("link");
    // newest first, links to the product pages
    expect(links.map((a) => a.getAttribute("href"))).toEqual([
      `/product/${seen[1].slug}`,
      `/product/${seen[0].slug}`,
    ]);
    const sections = Array.from(container.querySelectorAll("section"));
    const hero = container.querySelector('[data-testid="home-hero"]') as HTMLElement;
    const row = container.querySelector('[data-testid="category-row"]') as HTMLElement;
    expect(sections.indexOf(hero)).toBeLessThan(sections.indexOf(strip));
    expect(sections.indexOf(strip)).toBeLessThan(sections.indexOf(row));

    // One tap clears it.
    fireEvent.click(within(strip).getByRole("button", { name: /clear/i }));
    expect(screen.queryByTestId("recently-viewed-strip")).toBeNull();
  });

  it("puts the owner's public promo code at the top of the offers block", async () => {
    homepageSettings = {
      ...HOME_DEFAULTS,
      promo: { enabled: true, code: "WELCOME10", text: "10% off your first order" },
    };
    await renderHome();
    const block = await screen.findByTestId("offers-block");
    const card = within(block).getByTestId("promo-code-card");
    expect(card).toHaveTextContent("WELCOME10");
    expect(card).toHaveTextContent("10% off your first order");
    // The card comes before the reduced-price rail.
    const rail = within(block).getByTestId("rail-offers");
    expect(card.compareDocumentPosition(rail) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("shows customer stories after the shelf only when an approved review exists", async () => {
    let { container } = await renderHome();
    await screen.findByTestId("whole-shelf");
    // No approved review → no block, no "be the first" card on the front page.
    expect(screen.queryByTestId("customer-stories")).toBeNull();
    expect(screen.queryByText(/your story could be the first/i)).toBeNull();

    cleanup();
    __resetHomeSettings();
    reviewsPayload = {
      reviews: [
        {
          id: "r1",
          productId: PRODUCTS[0].id,
          rating: 5,
          body: "Fits like it was stitched for me.",
          author: "Rahim, Sunamganj",
          date: 1,
          status: "approved",
          verified: true,
        },
      ],
    };
    ({ container } = await renderHome());
    const stories = await screen.findByTestId("customer-stories");
    expect(within(stories).getByText(/stitched for me/)).toBeInTheDocument();
    expect(within(stories).getByText(/verified purchase/i)).toBeInTheDocument();
    // Order: shelf → stories → delivery check.
    const sections = Array.from(container.querySelectorAll("section"));
    const shelfIdx = sections.indexOf(
      container.querySelector('[data-testid="category-shelf"]') as HTMLElement,
    );
    const storiesIdx = sections.indexOf(stories);
    const deliveryIdx = sections.indexOf(
      container.querySelector('[data-testid="home-delivery-check"]') as HTMLElement,
    );
    expect(shelfIdx).toBeLessThan(storiesIdx);
    expect(storiesIdx).toBeLessThan(deliveryIdx);

    // The owner can switch the block off.
    cleanup();
    __resetHomeSettings();
    homepageSettings = { ...HOME_DEFAULTS, sections: { ...HOME_DEFAULTS.sections, stories: false } };
    await renderHome();
    await screen.findByTestId("whole-shelf");
    expect(screen.queryByTestId("customer-stories")).toBeNull();
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
