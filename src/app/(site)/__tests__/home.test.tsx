import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import Home from "../page";
import { CartProvider } from "@/components/cart/cart-provider";
import { HOME_DEFAULTS } from "@/lib/home-cms";
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
    expect(
      screen.getByRole("link", { name: "Heritage Green Panjabi" }),
    ).toHaveAttribute("href", "/product/heritage-green-panjabi");
  });

  it("keeps the homepage short and contains no launch-unsafe review proof", async () => {
    await renderHome();

    expect(screen.queryByText(/demo review/i)).toBeNull();
    expect(screen.queryByRole("heading", { name: /new arrivals/i })).toBeNull();
    expect(screen.queryByRole("heading", { name: /under ৳500/i })).toBeNull();
    expect(
      screen.queryByRole("heading", { name: /dress for your kind of day/i }),
    ).toBeNull();
    expect(screen.queryByRole("heading", { name: /customer reviews/i })).toBeNull();
  });

  it("follows hero → collections → featured → trust", async () => {
    const { container } = await renderHome();
    await screen.findByRole("link", { name: "Heritage Green Panjabi" });
    const selectors = [
      ".cinematic-hero",
      "#collections",
      "#featured",
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
