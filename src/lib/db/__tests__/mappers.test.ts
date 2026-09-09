import { describe, expect, it } from "vitest";
import {
  mapCoupon,
  mapOrder,
  mapProduct,
  mapShop,
  mapZone,
  youtubeIdFromUrl,
} from "../mappers";
import type {
  DbCoupon,
  DbMedia,
  DbOrder,
  DbOrderHistory,
  DbOrderItem,
  DbProduct,
  DbVariant,
  DbZone,
} from "../types";

const productRow = (overrides: Partial<DbProduct> = {}): DbProduct => ({
  id: "uuid-p1",
  shop_id: "shop-uuid-1",
  slug: "heritage-green-panjabi",
  name: "Heritage Green Panjabi",
  name_bn: "হেরিটেজ সবুজ পাঞ্জাবি",
  sku: "PS-MN-001",
  category_id: "men",
  subcategory: "Panjabi",
  short_description: "Short.",
  description: "Para one.\n\nPara two.",
  details: [{ label: "Fabric", value: "Cotton" }],
  price: 149000,
  compare_at_price: 185000,
  featured: true,
  is_new: true,
  in_stock: true,
  low_stock: false,
  status: "published",
  active: true,
  seo_title: null,
  seo_description: null,
  ...overrides,
});

const variant = (overrides: Partial<DbVariant> = {}): DbVariant => ({
  id: "v1",
  product_id: "uuid-p1",
  color: "Forest Green",
  size: "L",
  sku: "PS-MN-001-V1",
  price: 149000,
  stock: 12,
  reserved: 2,
  available: 10,
  active: true,
  ...overrides,
});

const media = (overrides: Partial<DbMedia> = {}): DbMedia => ({
  id: "m1",
  product_id: "uuid-p1",
  type: "image",
  url: "/images/products/panjabi.jpg",
  public_id: null,
  alt_text: "Panjabi",
  sort_order: 0,
  metadata: {},
  ...overrides,
});

describe("mapProduct", () => {
  it("derives colours, sizes and stock from active variants", () => {
    const p = mapProduct({
      product: productRow(),
      variants: [
        variant({ id: "v1", size: "M", stock: 5, reserved: 0, available: 5 }),
        variant({ id: "v2", size: "L", stock: 5, reserved: 5, available: 0 }),
        variant({ id: "v3", size: "XL", active: false }),
      ],
      media: [media()],
    });
    expect(p.colors).toEqual(["Forest Green"]);
    expect(p.sizes).toEqual(["M", "L"]);
    expect(p.stock).toBe(5);
    expect(p.inStock).toBe(true);
    expect(p.id).toBe("uuid-p1");
  });

  it("marks out-of-stock when every variant is exhausted", () => {
    const p = mapProduct({
      product: productRow(),
      variants: [variant({ stock: 4, reserved: 4, available: 0 })],
      media: [media()],
    });
    expect(p.stock).toBe(0);
    expect(p.inStock).toBe(false);
  });

  it("splits description paragraphs and orders media", () => {
    const p = mapProduct({
      product: productRow(),
      variants: [variant()],
      media: [
        media({ id: "m2", url: "/b.jpg", alt_text: "B", sort_order: 1 }),
        media({ id: "m1", url: "/a.jpg", alt_text: "A", sort_order: 0 }),
      ],
    });
    expect(p.description).toEqual(["Para one.", "Para two."]);
    expect(p.media.map((m) => m.src)).toEqual(["/a.jpg", "/b.jpg"]);
  });

  it("lifts the first YouTube row into video and picks the sale badge", () => {
    const p = mapProduct({
      product: productRow(),
      variants: [variant()],
      media: [
        media(),
        media({
          id: "m9",
          type: "youtube",
          url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
          alt_text: "Film",
          sort_order: 1,
        }),
      ],
    });
    expect(p.video).toEqual({ youtubeId: "dQw4w9WgXcQ", label: "Film" });
    expect(p.badge).toBe("sale");
    expect(p.rating).toBe(0); // no seed ratings until genuine reviews exist
  });
});

describe("youtubeIdFromUrl", () => {
  it("parses watch, share and embed URLs", () => {
    expect(youtubeIdFromUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(youtubeIdFromUrl("https://youtu.be/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(youtubeIdFromUrl("https://www.youtube.com/embed/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(youtubeIdFromUrl("https://example.com/x")).toBe(null);
    expect(youtubeIdFromUrl("not a url at all")).toBe(null);
  });
});

describe("mapZone / mapCoupon", () => {
  it("maps zones and coupon windows", () => {
    const zone: DbZone = {
      id: "z1", name: "Zone A", areas: ["Kandirpar"], charge: 5000,
      eta_label: "40–50 min", sort_order: 0, active: true,
    };
    expect(mapZone(zone)).toEqual({
      id: "z1", name: "Zone A", areas: ["Kandirpar"], charge: 5000,
      etaLabel: "40–50 min", active: true,
    });

    const coupon: DbCoupon = {
      id: "c1", code: "WELCOME100", type: "fixed", value: 10000,
      min_order: 100000, category_id: null,
      valid_from: null, valid_until: "2026-12-31T00:00:00.000Z",
      usage_limit: 500, used: 3, active: true,
    };
    const mapped = mapCoupon(coupon);
    expect(mapped.code).toBe("WELCOME100");
    expect(mapped.categoryId).toBeUndefined();
    expect(mapped.validUntil).toBe(Date.parse("2026-12-31T00:00:00.000Z"));
  });
});

describe("mapOrder", () => {
  const orderRow = (overrides: Partial<DbOrder> = {}): DbOrder => ({
    id: "order-uuid",
    shop_id: "shop-uuid-1",
    order_no: "PS-20260908-1234",
    customer_id: null,
    customer_name: "Rahat Ahmed",
    customer_phone: "01712345678",
    area: "Kandirpar",
    address: "House 12",
    note: "",
    zone_id: "z1",
    subtotal: 149000,
    delivery_charge: 5000,
    discount: 10000,
    coupon_id: "c1",
    total: 144000,
    payment: "cod",
    status: "confirmed",
    created_at: "2026-09-08T10:00:00.000Z",
    updated_at: "2026-09-08T10:05:00.000Z",
    ...overrides,
  });

  const itemRow = (overrides: Partial<DbOrderItem> = {}): DbOrderItem => ({
    id: "item-1", order_id: "order-uuid", product_id: "uuid-p1",
    variant_id: "v1", name: "Heritage Green Panjabi", sku: "PS-MN-001",
    variant: "Forest Green · L", unit_price: 149000, qty: 1,
    ...overrides,
  });

  const historyRow = (
    status: DbOrder["status"],
    created_at: string,
  ): DbOrderHistory => ({
    id: `h-${status}`, order_id: "order-uuid", status,
    note: null, changed_by: null, created_at,
  });

  it("maps the full bundle with timeline and coupon snapshot", () => {
    const order = mapOrder({
      order: orderRow(),
      items: [itemRow()],
      history: [
        historyRow("confirmed", "2026-09-08T10:05:00.000Z"),
        historyRow("pending", "2026-09-08T10:00:00.000Z"),
      ],
      zoneName: "Zone A — City Centre",
      etaLabel: "40–50 min",
      couponCode: "WELCOME100",
      products: new Map([["uuid-p1", { slug: "heritage-green-panjabi", image: "/a.jpg" }]]),
    });
    expect(order.id).toBe("PS-20260908-1234");
    expect(order.status).toBe("confirmed");
    expect(order.timeline.map((t) => t.status)).toEqual(["pending", "confirmed"]);
    expect(order.coupon).toEqual({ code: "WELCOME100", discount: 10000 });
    expect(order.items[0].slug).toBe("heritage-green-panjabi");
    expect(order.items[0].image).toBe("/a.jpg");
    expect(order.total).toBe(144000);
  });

  it("computes delivered minutes and tolerates missing history", () => {
    const delivered = mapOrder({
      order: orderRow({ status: "delivered" }),
      items: [itemRow()],
      history: [
        historyRow("pending", "2026-09-08T10:00:00.000Z"),
        historyRow("delivered", "2026-09-08T10:41:00.000Z"),
      ],
      zoneName: "Zone A",
      etaLabel: "40–50 min",
    });
    expect(delivered.deliveredMinutes).toBe(41);

    const bare = mapOrder({
      order: orderRow(),
      items: [itemRow({ product_id: null })],
      history: [],
      zoneName: "Zone A",
      etaLabel: "40–50 min",
    });
    expect(bare.timeline).toEqual([
      { status: "pending", at: Date.parse("2026-09-08T10:00:00.000Z") },
    ]);
    expect(bare.items[0].slug).toBe("");
  });
});

describe("mapShop (marketplace slice 1)", () => {
  it("maps a shop row and passes shopId through product/order mappers", () => {
    const shop = mapShop({
      id: "shop-uuid-1",
      slug: "prosanti-direct",
      name: "PROSANTI Direct",
      tagline: "",
      logo_url: "",
      phone: "01700000000",
      address: "House 1",
      zone_ids: ["z1", "z2"],
      prep_minutes: 15,
      commission_pct: 15,
      status: "active",
      is_open: true,
      rating_avg: 4.5,
      rating_count: 10,
      created_at: "2026-09-09T00:00:00.000Z",
    });
    expect(shop.slug).toBe("prosanti-direct");
    expect(shop.tagline).toBeUndefined();
    expect(shop.zoneIds).toEqual(["z1", "z2"]);
    expect(shop.commissionPct).toBe(15);
    expect(shop.ratingAvg).toBe(4.5);

    const product = mapProduct({
      product: productRow(),
      variants: [],
      media: [],
    });
    expect(product.shopId).toBe("shop-uuid-1");

    const order = mapOrder({
      order: {
        id: "order-uuid",
        shop_id: "shop-uuid-1",
        order_no: "PS-20260908-1234",
        customer_id: null,
        customer_name: "Rahat Ahmed",
        customer_phone: "01712345678",
        area: "Kandirpar",
        address: "House 12",
        note: "",
        zone_id: "z1",
        subtotal: 149000,
        delivery_charge: 5000,
        discount: 0,
        coupon_id: null,
        total: 154000,
        payment: "cod",
        status: "pending",
        created_at: "2026-09-08T10:00:00.000Z",
        updated_at: "2026-09-08T10:00:00.000Z",
      },
      items: [],
      history: [],
      zoneName: "Zone A",
      etaLabel: "40–50 min",
    });
    expect(order.shopId).toBe("shop-uuid-1");
  });
});
