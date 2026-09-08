import { describe, expect, it } from "vitest";
import {
  addCustom,
  isHttp,
  isImgUrl,
  mergeCustom,
  removeCustom,
  scanMedia,
  type MediaItem,
} from "../media-store";
import {
  agoLabel,
  markAllRead,
  markRead,
  unreadCountOf,
} from "../notification-store";
import type { Category, Product } from "../catalog";

const product = (id: string, media: { src: string; alt: string }[]): Product =>
  ({
    id,
    slug: id,
    sku: `SKU-${id}`,
    name: `Product ${id}`,
    category: "men",
    subCategory: "Panjabi",
    price: 1000,
    shortDescription: "",
    description: [],
    details: [],
    colors: ["Green"],
    sizes: ["M"],
    featured: false,
    isNew: false,
    inStock: true,
    media,
    rating: 0,
    reviewCount: 0,
  }) as Product;

const category = (id: string): Category =>
  ({
    id,
    name: id,
    nameBn: "",
    tagline: "",
    image: `/img/${id}.jpg`,
    subCategories: [],
  }) as Category;

describe("media library (§49)", () => {
  it("scans product/category/brand/homepage images, deduped", () => {
    const items = scanMedia(
      [
        product("p1", [
          { src: "/img/a.jpg", alt: "a1" },
          { src: "/img/b.jpg", alt: "b1" },
        ]),
        product("p2", [{ src: "/img/a.jpg", alt: "a2" }]),
      ],
      [category("men")],
    );
    // a, b, men category, hero, emblem + lockup = 6 (a deduped across p1/p2)
    expect(items.length).toBe(6);
    expect(items.map((m) => m.url)).toContain("/brand/logo-emblem.png");
    expect(items.filter((m) => m.url === "/img/a.jpg")).toHaveLength(1);
  });

  it("merges custom entries without duplicating urls", () => {
    const base: MediaItem[] = [{ id: "s1", url: "/img/a.jpg", alt: "", label: "", kind: "product" }];
    const merged = mergeCustom(base, [
      { id: "c1", url: "/img/a.jpg", alt: "", label: "", kind: "custom" },
      { id: "c2", url: "/img/c.jpg", alt: "", label: "", kind: "custom" },
    ]);
    expect(merged).toHaveLength(2);
  });

  it("validates http(s) and image-looking urls", () => {
    expect(isHttp("https://cdn.x/y.jpg")).toBe(true);
    expect(isHttp("/images/x.jpg")).toBe(false);
    expect(isImgUrl("https://cdn.x/y.jpg")).toBe(true);
    expect(isImgUrl("https://cdn.x/y")).toBe(true); // loose host check
    expect(isImgUrl("not a url")).toBe(false);
  });

  it("adds/removes custom entries immutably", () => {
    const list = addCustom([], { url: "/x.jpg", alt: "x", label: "X" });
    expect(list).toHaveLength(1);
    expect(list[0].kind).toBe("custom");
    expect(addCustom(list, { url: "/x.jpg", alt: "", label: "" })).toHaveLength(1); // dup
    expect(removeCustom(list, list[0].id)).toHaveLength(0);
  });
});

describe("notifications (§35)", () => {
  const notifs = [
    { id: "1", kind: "order" as const, title: "t", body: "b", at: Date.now(), read: false },
    { id: "2", kind: "review" as const, title: "t", body: "b", at: Date.now(), read: true },
  ];
  it("counts unread and marks read without mutating", () => {
    expect(unreadCountOf(notifs)).toBe(1);
    const all = markAllRead(notifs);
    expect(unreadCountOf(all)).toBe(0);
    expect(unreadCountOf(notifs)).toBe(1);
    expect(markRead(notifs, "2")).toHaveLength(2);
  });
  it("formats relative times", () => {
    const now = 1_000_000_000_000;
    expect(agoLabel(now, now)).toBe("just now");
    expect(agoLabel(now - 4 * 60_000, now)).toBe("4m ago");
    expect(agoLabel(now - 3 * 3_600_000, now)).toBe("3h ago");
    expect(agoLabel(now - 2 * 86_400_000, now)).toBe("2d ago");
  });
});
