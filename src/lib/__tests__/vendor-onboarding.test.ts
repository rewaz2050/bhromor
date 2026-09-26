/**
 * Round 4 (2026-09-26) — the vendor "get your shop ready" checklist.
 * No bKash/Nagad payout step yet: settlement stays offline for now.
 */
import { describe, expect, it } from "vitest";
import type { Product } from "../catalog";
import { checklistProgress, vendorChecklist } from "../vendor-onboarding";

const product = (over: Partial<Product> = {}): Product =>
  ({
    id: over.id ?? "p1",
    slug: "p1",
    name: "Panjabi",
    price: 1200,
    media: [],
    ...over,
  }) as Product;

const shop = { phone: "01712345678", address: "Kandirpar", tagline: "Fine panjabi", isOpen: true };

describe("vendorChecklist", () => {
  it("has five steps and no payout step", () => {
    const steps = vendorChecklist(shop, []);
    expect(steps.map((s) => s.id)).toEqual(["contact", "tagline", "products", "photo", "open"]);
    expect(steps.some((s) => /bkash|nagad|payout/i.test(`${s.title} ${s.detail}`))).toBe(false);
  });

  it("marks contact + tagline + open from the shop row", () => {
    const steps = vendorChecklist({ ...shop, address: "", isOpen: false }, []);
    const byId = Object.fromEntries(steps.map((s) => [s.id, s]));
    expect(byId.contact.done).toBe(false);
    expect(byId.contact.href).toBe("/vendor/settings");
    expect(byId.tagline.done).toBe(true);
    expect(byId.open.done).toBe(false);
    expect(byId.open.href).toBeNull();
  });

  it("counts live products and their photos, ignoring drafts", () => {
    const products = [
      product({ id: "a", media: [{ src: "https://x/a.jpg", alt: "a" }] }),
      product({ id: "b" }),
      product({ id: "c", status: "draft" }),
    ];
    const steps = vendorChecklist(shop, products);
    const byId = Object.fromEntries(steps.map((s) => [s.id, s]));
    expect(byId.products.done).toBe(false);
    expect(byId.products.detail).toMatch(/2 of 3 live/);
    expect(byId.products.cta).toBe("Add another product");
    expect(byId.photo.done).toBe(false);
    expect(byId.photo.detail).toMatch(/1 live product without a photo/);
  });

  it("is complete when everything is in place", () => {
    const products = ["a", "b", "c"].map((id) => product({ id, media: [{ src: `https://x/${id}.jpg`, alt: id }] }));
    const steps = vendorChecklist(shop, products);
    expect(checklistProgress(steps)).toEqual({ done: 5, total: 5, complete: true });
    expect(vendorChecklist(shop, []).find((s) => s.id === "products")?.cta).toBe("Add a product");
  });
});
