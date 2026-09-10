import { describe, expect, it } from "vitest";
import { DELIVERY_ZONES, PRODUCTS, type Product, type Shop } from "../catalog";
import { seedCoupons } from "../coupons-store";
import { bdt } from "../format";
import {
  validateOrderPayload,
  type OrderPayload,
  type OrderSnapshot,
} from "../order-validation";

const snapshot = (): OrderSnapshot => ({
  products: PRODUCTS,
  zones: DELIVERY_ZONES.map((z) => ({ ...z, active: z.active ?? true })),
  coupons: seedCoupons(),
});

const payload = (overrides: Partial<OrderPayload> = {}): OrderPayload => ({
  name: "Rahat Ahmed",
  phone: "01712345678",
  area: "Kandirpar",
  address: "House 12, Road 5, Kandirpar",
  zoneId: "z1",
  items: [{ productId: "p1", variantLabel: "Forest Green · L", qty: 1 }],
  ...overrides,
});

describe("validateOrderPayload", () => {
  it("accepts a valid order and prices it from the server snapshot", () => {
    const result = validateOrderPayload(payload(), snapshot());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // p1 = ৳1,490 → 149000 paisa; threshold now ৳1000, so free delivery.
    expect(result.draft.subtotal).toBe(bdt(1490));
    expect(result.draft.deliveryCharge).toBe(bdt(0));
    expect(result.draft.discount).toBe(0);
    expect(result.draft.total).toBe(bdt(1490));
    expect(result.draft.items[0].unitPrice).toBe(bdt(1490));
  });

  it("grants free delivery at the threshold and ignores client totals", () => {
    const result = validateOrderPayload(
      payload({ items: [{ productId: "p4", variantLabel: "Emerald · L", qty: 1 }] }),
      snapshot(),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.draft.subtotal).toBe(bdt(2290));
    expect(result.draft.deliveryCharge).toBe(0);
    expect(result.draft.total).toBe(bdt(2290));
  });

  it("applies a fixed coupon and snapshots code + discount", () => {
    const result = validateOrderPayload(
      payload({ couponCode: "welcome100" }),
      snapshot(),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // WELCOME100 = ৳100 off, min ৳1,000 — p1 qualifies, now free delivery.
    expect(result.draft.coupon).toEqual({
      code: "WELCOME100",
      discount: bdt(100),
      id: "c1",
    });
    expect(result.draft.total).toBe(bdt(1490) - bdt(100) + bdt(0));
  });

  it("restricts category coupons to eligible lines only", () => {
    const womenOnly = validateOrderPayload(
      payload({
        couponCode: "EID50",
        items: [{ productId: "p4", variantLabel: "Emerald · L", qty: 1 }],
      }),
      snapshot(),
    );
    expect(womenOnly.ok).toBe(false); // EID50 is men-only

    const mixed = validateOrderPayload(
      payload({
        couponCode: "EID50",
        items: [
          { productId: "p1", variantLabel: "Forest Green · L", qty: 1 },
          { productId: "p4", variantLabel: "Emerald · L", qty: 1 },
        ],
      }),
      snapshot(),
    );
    expect(mixed.ok).toBe(true);
    if (!mixed.ok) return;
    expect(mixed.draft.discount).toBe(bdt(50));
  });

  it("rejects unknown, expired and min-order coupons", () => {
    const snap = snapshot();
    expect(
      validateOrderPayload(payload({ couponCode: "NOPE" }), snap).ok,
    ).toBe(false);

    const expired = {
      ...snap.coupons[0],
      code: "OLD",
      validUntil: Date.now() - 1000,
    };
    expect(
      validateOrderPayload(payload({ couponCode: "OLD" }), {
        ...snap,
        coupons: [expired],
      }).ok,
    ).toBe(false);

    // PROSANTI15 needs ৳2,000; a lone gamcha set is ৳350.
    expect(
      validateOrderPayload(
        payload({
          couponCode: "PROSANTI15",
          items: [{ productId: "p7", variantLabel: "Red & Cream", qty: 1 }],
        }),
        snap,
      ).ok,
    ).toBe(false);
  });

  it("rejects bad contact fields with field errors", () => {
    const result = validateOrderPayload(
      payload({ name: "A", phone: "12345", area: "", address: "short" }),
      snapshot(),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const fields = result.errors.map((e) => e.field).sort();
    expect(fields).toEqual(["address", "area", "name", "phone"]);
  });

  it("accepts +880 country-code phones", () => {
    const result = validateOrderPayload(
      payload({ phone: "+8801712345678" }),
      snapshot(),
    );
    expect(result.ok).toBe(true);
  });

  it("rejects unknown/inactive zones and empty carts", () => {
    const snap = snapshot();
    expect(validateOrderPayload(payload({ zoneId: "zx" }), snap).ok).toBe(false);
    expect(
      validateOrderPayload(payload({ zoneId: "z1" }), {
        ...snap,
        zones: snap.zones.map((z) => ({ ...z, active: false })),
      }).ok,
    ).toBe(false);
    expect(validateOrderPayload(payload({ items: [] }), snap).ok).toBe(false);
  });

  it("rejects unavailable products, bad qty and bad variants", () => {
    const snap = snapshot();
    const badProduct = validateOrderPayload(
      payload({ items: [{ productId: "px", variantLabel: "X", qty: 1 }] }),
      snap,
    );
    expect(badProduct.ok).toBe(false);

    const outOfStock: Product = { ...PRODUCTS[0], inStock: false };
    expect(
      validateOrderPayload(payload(), { ...snap, products: [outOfStock] }).ok,
    ).toBe(false);

    const draft: Product = { ...PRODUCTS[0], status: "draft" };
    expect(
      validateOrderPayload(payload(), { ...snap, products: [draft] }).ok,
    ).toBe(false);

    for (const qty of [0, 11, Number.NaN]) {
      expect(
        validateOrderPayload(
          payload({ items: [{ productId: "p1", variantLabel: "Forest Green · L", qty }] }),
          snap,
        ).ok,
      ).toBe(false);
    }

    expect(
      validateOrderPayload(
        payload({ items: [{ productId: "p1", variantLabel: "Purple · XXS", qty: 1 }] }),
        snap,
      ).ok,
    ).toBe(false);

    // Duplicate lines are rejected rather than double-charged.
    expect(
      validateOrderPayload(
        payload({
          items: [
            { productId: "p1", variantLabel: "Forest Green · L", qty: 1 },
            { productId: "p1", variantLabel: "Forest Green · L", qty: 1 },
          ],
        }),
        snap,
      ).ok,
    ).toBe(false);
  });

  it("caps fixed discounts at the subtotal", () => {
    const snap = snapshot();
    const big = {
      ...snap.coupons[0],
      code: "BIG",
      value: bdt(99999),
      minOrder: 0,
    };
    const result = validateOrderPayload(payload({ couponCode: "BIG" }), {
      ...snap,
      coupons: [big],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.draft.discount).toBe(result.draft.subtotal);
    expect(result.draft.total).toBe(result.draft.deliveryCharge);
  });
});

describe("validateOrderPayload single-shop rule (marketplace slice 1)", () => {
  const shopped = (shopOf: Record<string, string>): Product[] =>
    PRODUCTS.map((p) => ({ ...p, shopId: shopOf[p.id] ?? "shop-1" }));

  it("accepts items from one shop", () => {
    const result = validateOrderPayload(
      payload({
        items: [
          { productId: "p1", variantLabel: "Forest Green · L", qty: 1 },
          { productId: "p4", variantLabel: "Emerald · L", qty: 1 },
        ],
      }),
      { ...snapshot(), products: shopped({}) },
    );
    expect(result.ok).toBe(true);
  });

  it("rejects mixed-shop bags with a field error", () => {
    const result = validateOrderPayload(
      payload({
        items: [
          { productId: "p1", variantLabel: "Forest Green · L", qty: 1 },
          { productId: "p4", variantLabel: "Emerald · L", qty: 1 },
        ],
      }),
      { ...snapshot(), products: shopped({ p4: "shop-2" }) },
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual([
      {
        field: "items",
        message:
          "One order can only contain items from one shop — check out each shop's bag separately.",
      },
    ]);
  });

  it("skips the check for demo seeds without shopId", () => {
    const result = validateOrderPayload(
      payload({
        items: [
          { productId: "p1", variantLabel: "Forest Green · L", qty: 1 },
          { productId: "p4", variantLabel: "Emerald · L", qty: 1 },
        ],
      }),
      snapshot(),
    );
    expect(result.ok).toBe(true);
  });
});

describe("validateOrderPayload shop availability (marketplace slice 4)", () => {
  const shop = (over: Partial<Shop> = {}): Shop => ({
    id: "shop-1",
    slug: "shop-one",
    name: "Shop One",
    phone: "01700000000",
    zoneIds: ["z1"],
    prepMinutes: 15,
    commissionPct: 15,
    status: "active",
    isOpen: true,
    ratingAvg: 0,
    ratingCount: 0,
    ...over,
  });
  const tagged = (): Product[] =>
    PRODUCTS.map((p) => ({ ...p, shopId: "shop-1" }));
  const snap = (shops: Shop[]): OrderSnapshot => ({
    ...snapshot(),
    products: tagged(),
    shops,
  });

  it("accepts an open shop serving the zone", () => {
    expect(validateOrderPayload(payload(), snap([shop()])).ok).toBe(true);
  });

  it("rejects a closed shop with an items error", () => {
    const result = validateOrderPayload(
      payload(),
      snap([shop({ isOpen: false })]),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual([
      {
        field: "items",
        message:
          "“Shop One” is closed right now — your bag will keep until it reopens.",
      },
    ]);
  });

  it("rejects suspended and unknown shops", () => {
    for (const shops of [
      [shop({ status: "suspended" })],
      [shop({ id: "other" })],
    ]) {
      const result = validateOrderPayload(payload(), snap(shops));
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.errors).toEqual([
        { field: "items", message: "That shop isn't taking orders right now." },
      ]);
    }
  });

  it("rejects a zone the shop doesn't serve with a zone error", () => {
    const result = validateOrderPayload(
      payload(),
      snap([shop({ zoneIds: ["z9"] })]),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0].field).toBe("zoneId");
    expect(result.errors[0].message).toMatch(/doesn't deliver/);
  });

  it("skips the check when the snapshot carries no shops", () => {
    const legacy: OrderSnapshot = { ...snapshot(), products: tagged() };
    expect(validateOrderPayload(payload(), legacy).ok).toBe(true);
  });
});
