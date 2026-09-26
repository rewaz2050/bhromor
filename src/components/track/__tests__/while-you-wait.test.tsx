/**
 * UX plan §7 (R6) — the tracker keeps people browsing while they wait, and
 * hands the tracker to whoever is at home.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import WhileYouWaitRail, { TRACK_RAIL_MIN, whileYouWait } from "@/components/track/while-you-wait-rail";
import ShareTrackerButton from "@/components/track/share-tracker-button";
import { CartProvider } from "@/components/cart/cart-provider";
import { LanguageProvider } from "@/components/i18n/language-provider";
import { CATEGORIES, PRODUCTS } from "@/lib/catalog";
import { __resetLiveCatalog, __serveLiveCatalogForTests } from "@/lib/live-catalog";

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

beforeEach(() => {
  localStorage.clear();
  document.cookie = "prosanti-lang=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
  __serveLiveCatalogForTests(PRODUCTS, CATEGORIES);
});
afterEach(() => {
  cleanup();
  __resetLiveCatalog();
  vi.unstubAllGlobals();
});

const order = { items: [{ productId: PRODUCTS[0].id }] } as Parameters<typeof whileYouWait>[0];

describe("whileYouWait", () => {
  it("never shows what is already in the parcel, in-stock only, new pieces first, capped at 8", () => {
    const items = whileYouWait(order, PRODUCTS);
    expect(items.length).toBeGreaterThanOrEqual(TRACK_RAIL_MIN);
    expect(items.length).toBeLessThanOrEqual(8);
    expect(items.map((p) => p.id)).not.toContain(PRODUCTS[0].id);
    expect(items.every((p) => p.inStock)).toBe(true);
    const firstNotNew = items.findIndex((p) => !p.isNew);
    const lastNew = items.map((p) => !!p.isNew).lastIndexOf(true);
    if (firstNotNew !== -1 && lastNew !== -1) expect(lastNew).toBeLessThan(firstNotNew);
  });

  it("is empty when nothing else is in stock", () => {
    expect(whileYouWait(order, PRODUCTS.map((p) => ({ ...p, inStock: false })))).toEqual([]);
  });
});

describe("WhileYouWaitRail + ShareTrackerButton", () => {
  it("renders the rail in Bengali linking to the newest listing", () => {
    render(
      <LanguageProvider initialLang="bn">
        <CartProvider>
          <WhileYouWaitRail order={order} />
        </CartProvider>
      </LanguageProvider>,
    );
    const rail = screen.getByTestId("track-rail");
    expect(within(rail).getByRole("heading", { name: "এই সপ্তাহে নতুন" })).toBeVisible();
    expect(within(rail).getByRole("link", { name: /সব নতুন পণ্য দেখুন/ })).toHaveAttribute(
      "href",
      "/shop?sort=newest",
    );
  });

  it("shares the same tracker link (id + phone) over WhatsApp when there is no native share sheet", () => {
    render(
      <LanguageProvider initialLang="bn">
        <ShareTrackerButton orderId="PS-20260918-0007" phone="01711111111" />
      </LanguageProvider>,
    );
    const link = screen.getByTestId("share-tracker");
    expect(link).toHaveTextContent("ট্র্যাকার লিংক পরিবারকে পাঠান");
    const href = decodeURIComponent(link.getAttribute("href")!);
    expect(href.startsWith("https://wa.me/?text=")).toBe(true);
    expect(href).toContain("/track?id=PS-20260918-0007&phone=01711111111");
    expect(href).toContain("PS-20260918-0007");
  });

  it("prefers the native share sheet when the browser has one", async () => {
    const share = vi.fn(() => Promise.resolve());
    vi.stubGlobal("navigator", { ...navigator, share });
    render(
      <LanguageProvider initialLang="en">
        <ShareTrackerButton orderId="PS-20260918-0007" phone="01711111111" />
      </LanguageProvider>,
    );
    const link = screen.getByTestId("share-tracker");
    const event = fireEvent.click(link);
    expect(event).toBe(false); // default (opening WhatsApp) was prevented
    expect(share).toHaveBeenCalledWith(
      expect.objectContaining({ url: expect.stringContaining("/track?id=PS-20260918-0007") }),
    );
  });
});
