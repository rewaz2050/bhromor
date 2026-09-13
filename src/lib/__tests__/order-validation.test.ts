import { describe, expect, it } from "vitest";
import { DELIVERY_ZONES, PRODUCTS, type Product, type Shop } from "../catalog";
import { launchCoupons } from "./coupon-fixtures";
import { bdt } from "../format";
import { defaultVariant } from "../cart";
import { dhakaDaySeconds, formatClock } from "../promos";
import {
  validateOrderPayload,
  type OrderPayload,
  type OrderSnapshot,
} from "../order-validation";

const snapshot = (): OrderSnapshot => ({
  products: PRODUCTS,
  zones: DELIVERY_ZONES.map((z) => ({ ...z, active: z.active ?? true })),
  coupons: launchCoupons(),
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
    // p1 = ৳1,490 → 149000 paisa; flat delivery charge ৳60 in every zone.
    expect(result.draft.subtotal).toBe(bdt(1490));
    expect(result.draft.deliveryCharge).toBe(bdt(60));
    expect(result.draft.discount).toBe(0);
    expect(result.draft.total).toBe(bdt(1550));
    expect(result.draft.items[0].unitPrice).toBe(bdt(1490));
    // Zone is derived server-side from district/upazila/para.
    expect(result.draft.zone.id).toBe("z1");
    expect(result.draft.customer.district).toBe("Sunamganj");
    expect(result.draft.customer.upazila).toBe("Sunamganj Sadar");
    expect(result.draft.customer.para).toBe("Boropara");
  });

  it("flat ৳60 applies in every zone — no launch offer, threshold or first-10 promo", () => {
    const inA = validateOrderPayload(payload(), snapshot());
    expect(inA.ok).toBe(true);
    if (inA.ok) expect(inA.draft.deliveryCharge).toBe(bdt(60));

    const inB = validateOrderPayload(
      payload({ para: "Notunpara", area: "Notunpara", zoneId: "z2" }),
      snapshot(),
    );
    expect(inB.ok).toBe(true);
    if (inB.ok) {
      expect(inB.draft.zone.id).toBe("z2");
      expect(inB.draft.deliveryCharge).toBe(bdt(60));
    }

    const outside = validateOrderPayload(
      payload({ district: "Sylhet", upazila: "Sylhet Sadar", para: "Subid Bazar", area: "Subid Bazar" }),
      snapshot(),
    );
    expect(outside.ok).toBe(true);
    if (outside.ok) {
      expect(outside.draft.zone.id).toBe("z4");
      expect(outside.draft.deliveryCharge).toBe(bdt(60));
    }
  });

  it("prices surcharges server-side: express + rain at midday (no night)", () => {
    // 15:00 local → not night
    const noonSnap = { ...snapshot(), now: new Date("2026-09-11T15:00:00").getTime(), customerOrderCount: 100 };
    const result = validateOrderPayload(
      payload({ is_express: true, is_rain: true }),
      noonSnap,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // flat ৳60 + express ৳40 + rain ৳15
    expect(result.draft.deliveryCharge).toBe(bdt(60 + 40 + 15));
    expect(result.draft.surchargeNight).toBe(0);
    expect(result.draft.surchargeExpress).toBe(bdt(40));
    expect(result.draft.surchargeRain).toBe(bdt(15));
  });

  it("adds night surcharge from the server clock and distance from the pin", () => {
    const nightSnap = { ...snapshot(), now: new Date("2026-09-11T23:30:00").getTime(), customerOrderCount: 100 };
    // A point ~2.2km south of the Traffic Point hub (still inside Sadar).
    const result = validateOrderPayload(
      payload({ lat: 25.05, lng: 91.4067 }),
      nightSnap,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.draft.surchargeNight).toBe(bdt(20));
    expect(result.draft.geo?.distanceKm).toBeGreaterThan(1);
    expect(result.draft.deliveryCharge).toBe(bdt(60 + 20));
  });

  it("pickup orders carry no delivery charge; tip lands in the total", () => {
    const result = validateOrderPayload(
      payload({ is_pickup: true, pickup_slot: "now", tip_amount: 2000 }),
      { ...snapshot(), now: new Date("2026-09-11T23:30:00").getTime(), customerOrderCount: 100 },
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
      { ...snapshot(), customerOrderCount: 5 },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.draft.zone.id).toBe("z2");
    expect(result.draft.deliveryCharge).toBe(bdt(60));
  });

  it("applies a fixed coupon and snapshots code + discount", () => {
    const result = validateOrderPayload(
      payload({ couponCode: "welcome100" }),
      snapshot(),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // WELCOME100 = ৳100 off, min ৳1,000 — p1 qualifies; flat ৳60 delivery.
    expect(result.draft.coupon).toEqual({
      code: "WELCOME100",
      discount: bdt(100),
      id: "c1",
    });
    expect(result.draft.total).toBe(bdt(1490) - bdt(100) + bdt(60));
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
      // Expired relative to the snapshot's pinned clock — deterministic
      // regardless of the wall-clock time the test happens to run at.
      validUntil: snap.now! - 1000,
    };
    expect(
      validateOrderPayload(payload({ couponCode: "OLD" }), {
        ...snap,
        coupons: [expired],
      }).ok,
    ).toBe(false);

    // SUNAMGANJ15 needs ৳500; a lone gamcha set is ৳350.
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

  it("skips the check for launch-seed items without shopId", () => {
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

/**
 * P1 #8 — wallet payments in the price path. The contract: a wallet method is
 * only accepted when the snapshot says the shop configured that wallet, and
 * only with a plausible TRXID. COD is always available and needs no proof.
 */
describe("validateOrderPayload — wallet payments (P1 #8)", () => {
  const withWallets = (w?: { bkash?: string; nagad?: string }): OrderSnapshot => ({
    ...snapshot(),
    payments: w,
  });

  it("defaults to COD — no TRXID required, nothing to verify", () => {
    const result = validateOrderPayload(payload(), withWallets({ bkash: "01711111111" }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.draft.paymentMethod).toBe("cod");
    expect(result.draft.paymentRef).toBeUndefined();
  });

  it("accepts bKash with a configured wallet and a valid TRXID", () => {
    const result = validateOrderPayload(
      payload({ payment_method: "bkash", payment_ref: " 9k2l7m4qxz " }),
      withWallets({ bkash: "01711111111" }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.draft.paymentMethod).toBe("bkash");
    expect(result.draft.paymentRef).toBe("9K2L7M4QXZ");
    // Money itself is untouched — the wallet is a method, not a discount.
    expect(result.draft.total).toBe(bdt(1550));
  });

  it("accepts Nagad the same way", () => {
    const result = validateOrderPayload(
      payload({ payment_method: "nagad", payment_ref: "NAGAD123456" }),
      withWallets({ nagad: "01822222222" }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.draft.paymentMethod).toBe("nagad");
    expect(result.draft.paymentRef).toBe("NAGAD123456");
  });

  it("refuses a wallet the shop never configured", () => {
    const result = validateOrderPayload(
      payload({ payment_method: "bkash", payment_ref: "9K2L7M4QXZ" }),
      withWallets({}),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual([
      {
        field: "payment",
        message: "bKash is not available right now — please use cash on delivery.",
      },
    ]);
  });

  it("refuses wallet payments without a TRXID or with an implausible one", () => {
    const wallets = { bkash: "01711111111" };
    for (const ref of [undefined, "", "abc", "1 2 3", "A".repeat(40)]) {
      const result = validateOrderPayload(
        payload({ payment_method: "bkash", payment_ref: ref }),
        withWallets(wallets),
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors.some((e) => e.field === "paymentRef")).toBe(true);
      }
    }
  });

  it("refuses an unknown payment method instead of guessing", () => {
    const result = validateOrderPayload(
      payload({ payment_method: "rocket", payment_ref: "9K2L7M4QXZ" }),
      withWallets({ bkash: "01711111111" }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual([
      {
        field: "payment",
        message:
          "Unknown payment method — choose cash on delivery, bKash or Nagad.",
      },
    ]);
  });
});

/**
 * P0 growth levers in the price path. The point of these tests is the CONTRACT:
 * a badge is decoration until the validator turns the same settings document
 * into a number on the order — and it must refuse levers the shop never armed.
 */
describe("validateOrderPayload — growth levers", () => {
  const AT = new Date("2026-09-11T15:00:00").getTime();
  const DAY = 86400;
  const wrap = (sec: number) => ((sec % DAY) + DAY) % DAY;
  const liveWindow = () => {
    const nowSec = dhakaDaySeconds(AT);
    return {
      start: formatClock(wrap(nowSec - 600)),
      end: formatClock(wrap(nowSec + 600)),
    };
  };

  const growthSnapshot = (
    promos: Record<string, unknown> = {},
    extra: Partial<OrderSnapshot> = {},
  ): OrderSnapshot => ({
    ...snapshot(),
    now: AT,
    promos: {
      flash: { enabled: false, discountPct: 0, slots: [], scope: "all", productIds: [], maxDiscountPaisa: 0 },
      bundle: { enabled: false, name: "Eid Set", discountPct: 10, maxItems: 4, minComplements: 1 },
      gift: { enabled: false },
      referral: { enabled: false },
      ...promos,
    },
    ...extra,
  });

  const panjabi = PRODUCTS.find((p) => p.id === "p1")!;
  const gamcha = PRODUCTS.find((p) => p.subCategory === "Gamcha")!;

  it("prices nothing when the shop has armed no lever", () => {
    const result = validateOrderPayload(
      payload({
        items: [
          { productId: "p1", variantLabel: "Forest Green · L", qty: 1 },
          { productId: gamcha.id, variantLabel: defaultVariant(gamcha), qty: 1 },
        ],
        gift: { is_gift: true, gift_recipient_name: "Karim Bhai" },
      }),
      growthSnapshot(),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.draft.promo).toBeUndefined();
    expect(result.draft.gift?.isGift).toBe(false);
    expect(result.draft.discount).toBe(0);
  });

  it("honours the snapshot's own clock for the flash window and caps per piece", () => {
    const flash = {
      enabled: true,
      title: "Eid Drop",
      discountPct: 25,
      slots: [liveWindow()],
      scope: "all",
      productIds: [],
      maxDiscountPaisa: 0,
    };
    const uncapped = validateOrderPayload(payload(), growthSnapshot({ flash }));
    expect(uncapped.ok).toBe(true);
    if (!uncapped.ok) return;
    const want = Math.floor((panjabi.price * 25) / 100);
    expect(uncapped.draft.promo).toEqual({
      kind: "flash",
      label: expect.stringContaining("25"),
      discount: want,
    });
    expect(uncapped.draft.discount).toBe(want);
    expect(uncapped.draft.total).toBe(panjabi.price - want + bdt(60));

    const capped = validateOrderPayload(
      payload(),
      growthSnapshot({ flash: { ...flash, maxDiscountPaisa: bdt(100) } }),
    );
    expect(capped.ok).toBe(true);
    if (!capped.ok) return;
    expect(capped.draft.promo?.discount).toBe(bdt(100));
  });

  it("gives the better of the drop and the set, never both", () => {
    const lines = [
      { productId: "p1", variantLabel: "Forest Green · L", qty: 1 },
      { productId: gamcha.id, variantLabel: defaultVariant(gamcha), qty: 1 },
    ];
    const listPrice = panjabi.price + gamcha.price;
    const setDiscount = Math.floor((listPrice * 10) / 100);

    const onlyBundle = validateOrderPayload(
      payload({ items: lines }),
      growthSnapshot({
        bundle: { enabled: true, name: "Eid Set", discountPct: 10, maxItems: 4, minComplements: 1 },
      }),
    );
    expect(onlyBundle.ok).toBe(true);
    if (!onlyBundle.ok) return;
    expect(onlyBundle.draft.promo?.kind).toBe("bundle");
    expect(onlyBundle.draft.promo?.discount).toBe(setDiscount);

    // A tiny drop must not beat the set; a big one must.
    const smallFlash = {
      enabled: true,
      title: "Drop",
      discountPct: 1,
      slots: [liveWindow()],
      scope: "all" as const,
      productIds: [],
      maxDiscountPaisa: 0,
    };
    const bundleStillWins = validateOrderPayload(
      payload({ items: lines }),
      growthSnapshot({
        flash: smallFlash,
        bundle: { enabled: true, name: "Eid Set", discountPct: 10, maxItems: 4, minComplements: 1 },
      }),
    );
    expect(bundleStillWins.ok && bundleStillWins.draft.promo?.kind).toBe("bundle");

    const bigFlash = { ...smallFlash, discountPct: 40 };
    const dropWins = validateOrderPayload(
      payload({ items: lines }),
      growthSnapshot({
        flash: bigFlash,
        bundle: { enabled: true, name: "Eid Set", discountPct: 10, maxItems: 4, minComplements: 1 },
      }),
    );
    expect(dropWins.ok && dropWins.draft.promo?.kind).toBe("flash");
  });

  it("adds the wrap fee by wrap id and tells the rider who to hand it to", () => {
    const result = validateOrderPayload(
      payload({
        gift: {
          is_gift: true,
          gift_recipient_name: "Karim Bhai",
          gift_message: "Eid Mubarak",
          gift_wrap: "premium",
        },
      }),
      growthSnapshot({
        gift: {
          enabled: true,
          standardWrapFeePaisa: bdt(50),
          premiumWrapFeePaisa: bdt(150),
          maxMessageChars: 240,
          maxRecipientChars: 60,
        },
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.draft.gift?.wrap).toBe("premium");
    expect(result.draft.gift?.feePaisa).toBe(bdt(150));
    expect(result.draft.total).toBe(panjabi.price + bdt(60) + bdt(150));
    expect(result.draft.customer.note).toContain("GIFT — hand to Karim Bhai");
  });

  it("rejects a gift with no receiver — a present with no name cannot be handed over", () => {
    const result = validateOrderPayload(
      payload({ gift: { is_gift: true, gift_recipient_name: "" } }),
      growthSnapshot({ gift: { enabled: true } }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((e) => e.field === "gift.recipientName")).toBe(true);
  });

  it("credits a friend's first order and refuses everyone else's", () => {
    const promos = {
      referral: {
        enabled: true,
        friendRewardPaisa: bdt(50),
        referrerRewardPaisa: bdt(50),
        minOrderPaisa: bdt(300),
        maxRewardsPerReferrer: 10,
      },
    };
    const records = [
      {
        code: "ABCDEF",
        customerId: "c1",
        referrerName: "Rahim",
        referrerPhone: "01812345678",
        rewardsGranted: 1,
        createdAt: 0,
      },
    ];

    const firstOrder = validateOrderPayload(
      payload({ referral_code: "PS-ABCDEF" }),
      growthSnapshot(promos, { referralRecords: records, priorOrderPhones: ["01812345678"] }),
    );
    expect(firstOrder.ok).toBe(true);
    if (!firstOrder.ok) return;
    expect(firstOrder.draft.referral).toEqual({ code: "ABCDEF", credit: bdt(50) });
    expect(firstOrder.draft.total).toBe(panjabi.price - bdt(50) + bdt(60));

    const returning = validateOrderPayload(
      payload({ referral_code: "PS-ABCDEF" }),
      growthSnapshot(promos, {
        referralRecords: records,
        priorOrderPhones: ["01712345678"],
      }),
    );
    expect(returning.ok).toBe(false);
    if (returning.ok) return;
    expect(returning.errors.some((e) => e.field === "referralCode")).toBe(true);
  });

  it("never lets the offers eat the delivery charge", () => {
    const cheap = PRODUCTS.find((p) => p.inStock && p.price <= bdt(350))!;
    const result = validateOrderPayload(
      payload({
        items: [{ productId: cheap.id, variantLabel: defaultVariant(cheap), qty: 1 }],
      }),
      growthSnapshot({
        flash: {
          enabled: true,
          title: "Drop",
          discountPct: 90,
          slots: [liveWindow()],
          scope: "all",
          productIds: [],
          maxDiscountPaisa: 0,
        },
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.draft.total).toBeGreaterThanOrEqual(bdt(60));
    expect(result.draft.promo!.discount).toBeLessThanOrEqual(cheap.price);
  });
});
