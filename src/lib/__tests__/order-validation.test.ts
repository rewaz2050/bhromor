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
  // Promo exhausted by default — tests opt in with totalOrders < 10.
  totalOrders: 100,
  // Fixed midday clock → deterministic night surcharge (off at 15:00).
  now: new Date("2026-09-11T15:00:00").getTime(),
});

const payload = (overrides: Partial<OrderPayload> = {}): OrderPayload => ({
  name: "Rahat Ahmed",
  phone: "01712345678",
  district: "Sunamganj",
  upazila: "Sunamganj Sadar",
  para: "Boropara",
  area: "Boropara",
  address: "House 12, Road 5, Boropara",
  zoneId: "z1",
  items: [{ productId: "p1", variantLabel: "Forest Green · L", qty: 1 }],
  ...overrides,
});

describe("validateOrderPayload", () => {
  it("accepts a valid order and prices it from the server snapshot", () => {
    const result = validateOrderPayload(payload(), snapshot());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // p1 = ৳1,490 → 149000 paisa; promo exhausted → flat Zone A charge ৳30.
    expect(result.draft.subtotal).toBe(bdt(1490));
    expect(result.draft.deliveryCharge).toBe(bdt(30));
    expect(result.draft.discount).toBe(0);
    expect(result.draft.total).toBe(bdt(1520));
    expect(result.draft.items[0].unitPrice).toBe(bdt(1490));
    // Zone is derived server-side from district/upazila/para.
    expect(result.draft.zone.id).toBe("z1");
    expect(result.draft.customer.district).toBe("Sunamganj");
    expect(result.draft.customer.upazila).toBe("Sunamganj Sadar");
    expect(result.draft.customer.para).toBe("Boropara");
  });

  it("first 10 orders ride free — but ONLY inside Zone A", () => {
    const promoSnap = { ...snapshot(), totalOrders: 5 };
    const inA = validateOrderPayload(payload(), promoSnap);
    expect(inA.ok).toBe(true);
    if (inA.ok) expect(inA.draft.deliveryCharge).toBe(0);

    const inB = validateOrderPayload(
      payload({ para: "Notunpara", area: "Notunpara", zoneId: "z2" }),
      promoSnap,
    );
    expect(inB.ok).toBe(true);
    if (inB.ok) {
      expect(inB.draft.zone.id).toBe("z2");
      expect(inB.draft.deliveryCharge).toBe(bdt(50));
    }

    const outside = validateOrderPayload(
      payload({ district: "Sylhet", upazila: "Sylhet Sadar", para: "Subid Bazar", area: "Subid Bazar" }),
      promoSnap,
    );
    expect(outside.ok).toBe(true);
    if (outside.ok) {
      expect(outside.draft.zone.id).toBe("z4");
      expect(outside.draft.deliveryCharge).toBe(bdt(100));
    }
  });

  it("prices surcharges server-side: express + rain at midday (no night)", () => {
    // 15:00 local → not night
    const noonSnap = { ...snapshot(), now: new Date("2026-09-11T15:00:00").getTime(), totalOrders: 100 };
    const result = validateOrderPayload(
      payload({ is_express: true, is_rain: true }),
      noonSnap,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Zone A ৳30 + express ৳40 + rain ৳15
    expect(result.draft.deliveryCharge).toBe(bdt(30 + 40 + 15));
    expect(result.draft.surchargeNight).toBe(0);
    expect(result.draft.surchargeExpress).toBe(bdt(40));
    expect(result.draft.surchargeRain).toBe(bdt(15));
  });

  it("adds night surcharge from the server clock and distance from the pin", () => {
    const nightSnap = { ...snapshot(), now: new Date("2026-09-11T23:30:00").getTime(), totalOrders: 100 };
    // A point ~2.2km south of the Traffic Point hub (still inside Sadar).
    const result = validateOrderPayload(
      payload({ lat: 25.05, lng: 91.4067 }),
      nightSnap,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.draft.surchargeNight).toBe(bdt(20));
    expect(result.draft.geo?.distanceKm).toBeGreaterThan(1);
    // distance > 4km only beyond 4km; 2.2km → no distance extra
    expect(result.draft.surchargeDistance).toBe(0);
    expect(result.draft.deliveryCharge).toBe(bdt(30 + 20));
  });

  it("pickup orders carry no delivery charge; tip lands in the total", () => {
    const result = validateOrderPayload(
      payload({ is_pickup: true, pickup_slot: "now", tip_amount: 2000 }),
      { ...snapshot(), now: new Date("2026-09-11T23:30:00").getTime(), totalOrders: 100 },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.draft.isPickup).toBe(true);
    expect(result.draft.deliveryCharge).toBe(0);
    expect(result.draft.surchargeNight).toBe(0);
    expect(result.draft.total).toBe(bdt(1490) + bdt(20));
  });

  it("ignores a client-forced cheaper zone — the address decides", () => {
    const result = validateOrderPayload(
      payload({ zoneId: "z1", para: "Notunpara", area: "Notunpara" }),
      { ...snapshot(), totalOrders: 5 },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.draft.zone.id).toBe("z2");
    expect(result.draft.deliveryCharge).toBe(bdt(50));
  });

  it("applies a fixed coupon and snapshots code + discount", () => {
    const result = validateOrderPayload(
      payload({ couponCode: "welcome100" }),
      snapshot(),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // WELCOME100 = ৳100 off, min ৳1,000 — p1 qualifies; Zone A charge ৳30.
    expect(result.draft.coupon).toEqual({
      code: "WELCOME100",
      discount: bdt(100),
      id: "c1",
    });
    expect(result.draft.total).toBe(bdt(1490) - bdt(100) + bdt(30));
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

    // SUNAMGANJ15 needs ৳2,000; a lone gamcha set is ৳350.
    expect(
      validateOrderPayload(
        payload({
          couponCode: "SUNAMGANJ15",
          items: [{ productId: "p7", variantLabel: "Red & Cream", qty: 1 }],
        }),
        snap,
      ).ok,
    ).toBe(false);
  });

  it("rejects bad contact fields with field errors", () => {
    const result = validateOrderPayload(
      payload({ name: "A", phone: "12345", para: "", area: "", address: "short" }),
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

  it("rejects when the derived zone is missing/inactive and empty carts", () => {
    const snap = snapshot();
    expect(
      validateOrderPayload(payload(), {
        ...snap,
        zones: snap.zones.filter((z) => z.id !== "z1"),
      }).ok,
    ).toBe(false);
    expect(
      validateOrderPayload(payload(), {
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
