/**
 * B4 (2026-09-28) — attributing a page_view to the shop whose storefront it is.
 *
 * Without this, a shop's funnel could only start at "someone opened a product":
 * the route tracker knows the pathname, not the shop. ShopAttribute registers
 * the shop while the storefront is on screen and the tracker stamps it, so
 * "people who opened my page" is a real number.
 *
 * Two things can go wrong and both are pinned here: a page_view that keeps the
 * previous shop after leaving it (over-counting), and a shop id leaking onto
 * events that belong to no shop.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetPageShop, currentPageShop, setPageShop } from "@/lib/page-shop";

vi.mock("server-only", () => ({}));

/** Copies of the parts of the window object the sink touches. */
const win = vi.hoisted(() => ({ session: {} as Record<string, string>, local: {} as Record<string, string> }));
vi.stubGlobal("window", {
  sessionStorage: {
    getItem: (k: string) => win.session[k] ?? null,
    setItem: (k: string, v: string) => {
      win.session[k] = v;
    },
  },
  localStorage: {
    getItem: (k: string) => win.local[k] ?? null,
    setItem: (k: string, v: string) => {
      win.local[k] = v;
    },
  },
  location: { pathname: "/shops/sitara" },
  addEventListener: () => {},
});
vi.stubGlobal("document", { addEventListener: () => {}, documentElement: { lang: "bn" } });

const { __resetEventsSink, __queuedEvents } = await import("@/lib/events-sink");
const { wireEvent } = await import("@/lib/analytics");

beforeEach(() => {
  __resetPageShop();
  __resetEventsSink();
  win.session = {};
  win.local = { "prosanti-lang": "bn" };
});
afterEach(() => __resetPageShop());

describe("page-shop registry", () => {
  it("remembers the shop while its storefront is on screen", () => {
    expect(currentPageShop()).toBeNull();
    setPageShop("s1");
    expect(currentPageShop()).toBe("s1");
  });

  it("forgets it on the way out (null, empty, whitespace)", () => {
    setPageShop("s1");
    setPageShop(null);
    expect(currentPageShop()).toBeNull();
    setPageShop("s1");
    setPageShop("   ");
    expect(currentPageShop()).toBeNull();
  });

  it("trims and caps a junky id rather than storing it raw", () => {
    setPageShop("  s1  ");
    expect(currentPageShop()).toBe("s1");
    setPageShop("x".repeat(200));
    expect(currentPageShop()).toHaveLength(80);
  });
});

describe("wireEvent", () => {
  it("stamps a page_view with the shop on screen", () => {
    setPageShop("s1");
    const wire = wireEvent({ type: "page_view", path: "/shops/sitara" });
    // `track()` fills the shop in when the event does not name one …
    expect(wire.shop).toBeUndefined();
    // … so the explicit form is what the route tracker sends:
    expect(wireEvent({ type: "page_view", path: "/shops/sitara", shop: "s1" }).shop).toBe("s1");
  });

  it("leaves an ordinary page_view unattributed", () => {
    expect(wireEvent({ type: "page_view", path: "/" }).shop).toBeUndefined();
  });

  it("keeps the product events' own shop, and gives checkout the cart's shop", () => {
    const item = { id: "p1", name: "Saree", price: 100_000, qty: 1, shopId: "s1" };
    expect(wireEvent({ type: "view_item", item }).shop).toBe("s1");
    expect(wireEvent({ type: "add_to_cart", item, source: "pdp" }).shop).toBe("s1");
    expect(
      wireEvent({ type: "begin_checkout", items: [item], value: 100_000 }).shop,
    ).toBe("s1");
    expect(wireEvent({ type: "begin_checkout", items: [], value: 0 }).shop).toBeUndefined();
  });

  it("carries the shop for a rail impression when the rail is a shop's own", () => {
    expect(wireEvent({ type: "view_item_list", list: "shop:s1", count: 6 }).shop).toBeUndefined();
    expect(wireEvent({ type: "view_item_list", list: "shop:s1", count: 6, shop: "s1" }).shop).toBe(
      "s1",
    );
  });
});

describe("track() on a shop's storefront", () => {
  it("records the page_view carrying the shop, and clears it on leaving", async () => {
    const { track } = await import("@/lib/analytics");
    setPageShop("s1");
    track({ type: "page_view", path: "/shops/sitara", shop: "s1" });
    const queued = __queuedEvents();
    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({ t: "page_view", p: "/shops/sitara", shop: "s1", lang: "bn" });

    // Leaving the storefront: the next page_view is nobody's.
    setPageShop(null);
    track({ type: "page_view", path: "/" });
    const after = __queuedEvents();
    expect(after[1]).toMatchObject({ t: "page_view", p: "/" });
    expect(after[1].shop).toBeUndefined();
  });
});
