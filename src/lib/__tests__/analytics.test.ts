import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  analyticsEnabled,
  ga4Id,
  itemFromProduct,
  metaPixelId,
  taka,
  track,
  trackPurchaseOnce,
  vendorPayloads,
} from "@/lib/analytics";
import { PRODUCTS } from "@/lib/catalog";

const env = process.env;

beforeEach(() => {
  process.env = { ...env };
  delete process.env.NEXT_PUBLIC_META_PIXEL_ID;
  delete process.env.NEXT_PUBLIC_GA4_ID;
  sessionStorage.clear();
  delete (window as { fbq?: unknown }).fbq;
  delete (window as { gtag?: unknown }).gtag;
});
afterEach(() => {
  process.env = env;
});

describe("analytics ids", () => {
  it("is off unless a well-formed id is configured", () => {
    expect(analyticsEnabled()).toBe(false);
    process.env.NEXT_PUBLIC_META_PIXEL_ID = "not-an-id";
    process.env.NEXT_PUBLIC_GA4_ID = "UA-12345-1";
    expect(metaPixelId()).toBeNull();
    expect(ga4Id()).toBeNull();
    expect(analyticsEnabled()).toBe(false);
    process.env.NEXT_PUBLIC_META_PIXEL_ID = " 123456789012345 ";
    process.env.NEXT_PUBLIC_GA4_ID = "g-abc123";
    expect(metaPixelId()).toBe("123456789012345");
    expect(ga4Id()).toBe("G-ABC123");
    expect(analyticsEnabled()).toBe(true);
  });
});

describe("funnel payloads", () => {
  const product = PRODUCTS[0];
  it("converts paisa to taka once and maps one event to both vendors", () => {
    expect(taka(189000)).toBe(1890);
    const item = itemFromProduct(product, 2);
    const { meta, ga } = vendorPayloads({ type: "add_to_cart", item });
    expect(meta?.[0]).toBe("AddToCart");
    expect(meta?.[1]).toMatchObject({
      content_ids: [product.id],
      currency: "BDT",
      value: taka(product.price * 2),
    });
    expect(ga?.[0]).toBe("add_to_cart");
    expect(ga?.[1]).toMatchObject({
      currency: "BDT",
      items: [{ item_id: product.id, quantity: 2, price: taka(product.price) }],
    });
  });

  it("purchase carries the order id, total and delivery, never personal data", () => {
    const { meta, ga } = vendorPayloads({
      type: "purchase",
      orderId: "PR-1",
      items: [itemFromProduct(product)],
      value: product.price + 6000,
      delivery: 6000,
    });
    expect(ga?.[1]).toMatchObject({ transaction_id: "PR-1", shipping: 60, value: taka(product.price + 6000) });
    // item_name is the product's name; no customer field ever rides along.
    expect(JSON.stringify([meta, ga])).not.toMatch(/phone|address|customer|email/);
    expect(meta?.[1]).toMatchObject({ num_items: 1, currency: "BDT" });
  });
});

describe("track()", () => {
  it("calls whichever vendors are loaded and never throws without them", () => {
    expect(() => track({ type: "page_view", path: "/shop" })).not.toThrow();
    const fbq = vi.fn();
    const gtag = vi.fn(() => {
      throw new Error("blocked");
    });
    (window as { fbq?: unknown }).fbq = fbq;
    (window as { gtag?: unknown }).gtag = gtag;
    expect(() => track({ type: "search", query: "panjabi" })).not.toThrow();
    expect(fbq).toHaveBeenCalledWith("track", "Search", { search_string: "panjabi" });
    expect(gtag).toHaveBeenCalledTimes(1);
  });

  it("counts a purchase once per order id", () => {
    const fbq = vi.fn();
    (window as { fbq?: unknown }).fbq = fbq;
    const ev = {
      type: "purchase" as const,
      orderId: "PR-9",
      items: [itemFromProduct(PRODUCTS[0])],
      value: 1000,
      delivery: 0,
    };
    expect(trackPurchaseOnce(ev)).toBe(true);
    expect(trackPurchaseOnce(ev)).toBe(false);
    expect(fbq).toHaveBeenCalledTimes(1);
    expect(trackPurchaseOnce({ ...ev, orderId: "PR-10" })).toBe(true);
  });
});
