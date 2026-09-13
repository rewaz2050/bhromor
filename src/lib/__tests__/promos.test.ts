import { describe, expect, it } from "vitest";
import { PRODUCTS } from "../catalog";
import { bdt } from "../format";
import {
  FLASH_DEFAULTS,
  buildBundleOffer,
  countdownLabel,
  dhakaDaySeconds,
  effectiveUnitPrice,
  flashDiscountForCart,
  flashProducts,
  flashState,
  formatClock,
  isFlashProduct,
  matchBundle,
  parseClock,
  pickBestOffer,
  promoView,
  sanitizeBundle,
  sanitizeFlash,
} from "../promos";

/** A fixed instant: 12:30 in Dhaka = 06:30 UTC. */
const AT = Date.UTC(2026, 8, 13, 6, 30, 0);

const cfg = (over: Record<string, unknown> = {}) =>
  sanitizeFlash({
    enabled: true,
    title: "Eid Flash Drop",
    discountPct: 50,
    slots: [
      { start: "12:00", end: "13:00" },
      { start: "19:00", end: "21:00" },
    ],
    scope: "all",
    ...over,
  });

describe("Flash sale clock", () => {
  it("reads Dhaka time without a timezone dependency", () => {
    expect(dhakaDaySeconds(AT)).toBe(12 * 3600 + 30 * 60);
    expect(dhakaDaySeconds(Date.UTC(2026, 8, 13, 18, 0, 0))).toBe(0);
  });

  it("parses only real 24h clocks", () => {
    expect(parseClock("12:00")).toBe(43200);
    expect(parseClock("9:05")).toBe(9 * 3600 + 5 * 60);
    expect(parseClock("24:00")).toBeNull();
    expect(parseClock("12-00")).toBeNull();
    expect(parseClock(1200)).toBeNull();
    expect(formatClock(45000)).toBe("12:30");
  });

  it("knows when a window is running and how much is left", () => {
    const state = flashState(cfg(), AT);
    expect(state.active).toBe(true);
    expect(state.msLeft).toBe(30 * 60 * 1000);
    expect(state.progress).toBeCloseTo(0.5, 5);
    // Next window is tonight at 19:00 Dhaka — 6½ hours after 12:30.
    expect(state.nextStartsAtMs).toBe(AT + 6.5 * 3600 * 1000);
  });

  it("falls back to the next window outside a drop", () => {
    const midday = Date.UTC(2026, 8, 13, 7, 0, 0); // 13:00 Dhaka — just closed
    const state = flashState(cfg(), midday);
    expect(state.active).toBe(false);
    expect(state.msLeft).toBe(0);
    expect(state.nextStartsAtMs).toBe(midday + 6 * 3600 * 1000);
  });

  it("wraps an overnight window", () => {
    const night = Date.UTC(2026, 8, 13, 17, 30, 0); // 23:30 Dhaka
    const state = flashState(cfg({ slots: [{ start: "22:00", end: "01:00" }] }), night);
    expect(state.active).toBe(true);
    expect(state.msLeft).toBe(90 * 60 * 1000);
  });

  it("is inert when the switch is off", () => {
    const state = flashState(cfg({ enabled: false }), AT);
    expect(state.active).toBe(false);
    expect(state.nextStartsAtMs).toBeNull();
  });

  it("formats a countdown for humans", () => {
    expect(countdownLabel(3 * 3_600_000 + 4 * 60_000 + 5_000)).toBe("03:04:05");
    expect(countdownLabel(-1)).toBe("00:00:00");
  });
});

describe("Flash config sanitizing", () => {
  it("drops nonsense slots and clamps the percent", () => {
    const clean = sanitizeFlash({
      enabled: true,
      discountPct: 500,
      slots: [{ start: "nope", end: "12:00" }, { start: "12:00", end: "12:00" }, { start: "13:00", end: "14:00" }],
      scope: "bogus",
      productIds: ["a", "a", "", null],
      maxDiscountPaisa: -10,
    });
    expect(clean.discountPct).toBe(90);
    expect(clean.slots).toEqual([{ start: "13:00", end: "14:00" }]);
    expect(clean.scope).toBe("featured");
    expect(clean.productIds).toEqual(["a"]);
    expect(clean.maxDiscountPaisa).toBe(0);
  });

  it("normalizes a stored clock and ignores unparseable times", () => {
    expect(sanitizeFlash({ slots: [{ start: "9:05", end: "10:00" }] }).slots).toEqual([
      { start: "09:05", end: "10:00" },
    ]);
    // "9:5" is not a time a person can be held to — the default windows win.
    expect(sanitizeFlash({ slots: [{ start: "9:5", end: "10:0" }] }).slots).toEqual(
      FLASH_DEFAULTS.slots,
    );
  });
});

describe("Flash pricing", () => {
  it("scopes by featured flag and explicit id list", () => {
    const panjabi = PRODUCTS.find((p) => p.featured)!;
    const tee = PRODUCTS.find((p) => !p.featured)!;
    expect(isFlashProduct(cfg({ scope: "featured" }), panjabi)).toBe(true);
    expect(isFlashProduct(cfg({ scope: "featured" }), tee)).toBe(false);
    expect(isFlashProduct(cfg({ scope: "all" }), tee)).toBe(true);
    expect(isFlashProduct(cfg({ scope: "selected", productIds: [tee.slug] }), tee)).toBe(true);
    expect(isFlashProduct(cfg({ scope: "selected", productIds: ["p9"] }), tee)).toBe(false);
  });

  it("only prices in-stock listings", () => {
    const soldOut = { ...PRODUCTS[0], inStock: false };
    expect(isFlashProduct(cfg(), soldOut)).toBe(true); // eligible flag…
    const state = flashState(cfg(), AT);
    // …but the shopper never sees a sale price on nothing to buy.
    expect(effectiveUnitPrice(soldOut, cfg(), state).price).toBe(soldOut.price);
  });

  it("discounts per line and caps the order", () => {
    const state = flashState(cfg(), AT);
    const shirt = PRODUCTS.find((p) => p.subCategory === "Shirts")!;
    const lines = [{ product: shirt, qty: 2, lineTotal: shirt.price * 2 }];
    // The default cap is ৳500 PER PIECE, so a ৳1,290 × 2 bag at 50% is capped on
    // each unit: ৳645 wanted, ৳500 allowed, twice. That cap is the point of
    // having one — and the badge quotes the very same ৳500 off each piece.
    const full = flashDiscountForCart(cfg(), state, lines);
    expect(full.discount).toBe(100000);
    expect(full.items).toBe(2);
    expect(effectiveUnitPrice(shirt, cfg(), state).price).toBe(shirt.price - 50000);
    const capped = flashDiscountForCart(cfg({ maxDiscountPaisa: bdt(100) }), state, lines);
    expect(capped.discount).toBe(bdt(200));
    // Zero means "no cap", not "no discount".
    expect(
      flashDiscountForCart(cfg({ maxDiscountPaisa: 0 }), state, lines).discount,
    ).toBe(Math.floor((shirt.price * 2 * 50) / 100));
  });

  it("is worth nothing outside the window", () => {
    const shirt = PRODUCTS.find((p) => p.subCategory === "Shirts")!;
    const later = flashState(cfg(), AT + 4 * 3600 * 1000);
    expect(flashDiscountForCart(cfg(), later, [{ product: shirt, qty: 1, lineTotal: shirt.price }]).discount).toBe(0);
  });

  it("lists the drop for the rail in catalog order", () => {
    expect(flashProducts(PRODUCTS, cfg({ scope: "featured" })).every((p) => p.featured)).toBe(true);
    expect(flashProducts(PRODUCTS, cfg({ enabled: false }))).toEqual([]);
  });
});

describe("Bundle offers", () => {
  const panjabi = PRODUCTS.find((p) => p.subCategory === "Panjabi")!;
  const bundleCfg = sanitizeBundle({ enabled: true, discountPct: 10, name: "Eid Set" });

  it("builds a set from the editorial pairing rules", () => {
    const offer = buildBundleOffer(panjabi, PRODUCTS, bundleCfg)!;
    expect(offer.lines.map((l) => l.product.subCategory)).toEqual(["Panjabi", "Gamcha"]);
    expect(offer.listPrice).toBe(panjabi.price + offer.lines[1].product.price);
    expect(offer.discount).toBe(Math.floor((offer.listPrice * 10) / 100));
    expect(offer.bundlePrice).toBe(offer.listPrice - offer.discount);
    expect(offer.name).toContain("Eid Set");
  });

  it("refuses to invent a bundle with nothing to complete", () => {
    const lonely = PRODUCTS.filter((p) => p.subCategory === "Gamcha");
    expect(buildBundleOffer(lonely[0], lonely, bundleCfg)).toBeNull();
    expect(buildBundleOffer({ ...panjabi, inStock: false }, PRODUCTS, bundleCfg)).toBeNull();
    expect(buildBundleOffer(panjabi, PRODUCTS, sanitizeBundle({ enabled: false }))).toBeNull();
  });

  it("caps the set at maxItems pieces", () => {
    const offer = buildBundleOffer(panjabi, PRODUCTS, sanitizeBundle({ enabled: true, maxItems: 2 }))!;
    expect(offer.lines).toHaveLength(2);
  });

  it("matches a complete set in the bag, and only then", () => {
    const offer = buildBundleOffer(panjabi, PRODUCTS, bundleCfg)!;
    const pajama = offer.lines[1].product;
    expect(matchBundle([{ product: panjabi, qty: 1 }], PRODUCTS, bundleCfg)).toBeNull();
    const matched = matchBundle(
      [
        { product: panjabi, qty: 1 },
        { product: pajama, qty: 1 },
        { product: PRODUCTS[2], qty: 3 },
      ],
      PRODUCTS,
      bundleCfg,
    )!;
    expect(matched.discount).toBe(offer.discount);
  });

  it("will not call a sold-out half a bundle", () => {
    const gamcha = buildBundleOffer(panjabi, PRODUCTS, bundleCfg)!.lines[1].product;
    const soldOut = { ...gamcha, inStock: false };
    expect(
      matchBundle(
        [
          { product: panjabi, qty: 1 },
          { product: soldOut, qty: 1 },
        ],
        PRODUCTS.map((p) => (p.id === soldOut.id ? soldOut : p)),
        bundleCfg,
      ),
    ).toBeNull();
  });

  it("never discounts a set below the parts already on flash", () => {
    // The offer picker decides; a bundle that cannot beat a flash drop simply
    // loses — which is why both are computed from the same cart.
    const offer = buildBundleOffer(panjabi, PRODUCTS, bundleCfg)!;
    const state = flashState(cfg(), AT);
    const flash = flashDiscountForCart(
      cfg(),
      state,
      offer.lines.map((l) => ({ product: l.product, qty: 1, lineTotal: l.lineTotal })),
    );
    const best = pickBestOffer([
      { kind: "flash", label: "Flash Drop", discount: flash.discount },
      { kind: "bundle", label: offer.name, discount: offer.discount },
    ])!;
    expect(best.kind).toBe("flash"); // 50% beats 10%
    expect(best.alternatives).toEqual(["bundle"]);
  });
});

describe("One automatic offer per order", () => {
  it("picks the biggest discount", () => {
    const best = pickBestOffer([
      { kind: "coupon", label: "EID10", discount: bdt(120) },
      { kind: "flash", label: "Flash Drop", discount: bdt(300) },
      { kind: "bundle", label: "Eid Set", discount: bdt(200) },
    ])!;
    expect(best.kind).toBe("flash");
    expect(best.alternatives).toEqual(["bundle", "coupon"]);
  });

  it("breaks ties in favour of the ticking clock", () => {
    const best = pickBestOffer([
      { kind: "coupon", label: "FLAT", discount: bdt(100) },
      { kind: "bundle", label: "Set", discount: bdt(100) },
      { kind: "flash", label: "Flash", discount: bdt(100) },
    ])!;
    expect(best.kind).toBe("flash");
  });

  it("ignores offers worth nothing", () => {
    expect(pickBestOffer([{ kind: "flash", label: "x", discount: 0 }])).toBeNull();
    expect(pickBestOffer([])).toBeNull();
  });
});

describe("Public promo view", () => {
  it("exposes the countdown and nothing staff-only", () => {
    const view = promoView({ flash: cfg(), bundle: sanitizeBundle({}) }, AT);
    expect(view.flash.active).toBe(true);
    expect(view.flash.msLeft).toBe(30 * 60 * 1000);
    expect(view.flash.asOf).toBe(AT);
    expect(Object.keys(view.flash).sort()).toEqual(
      [
        "active",
        "asOf",
        "discountPct",
        "enabled",
        "endsAtMs",
        "maxDiscountPaisa",
        "msLeft",
        "nextStartsAtMs",
        "productIds",
        "progress",
        "scope",
        "slots",
        "title",
      ].sort(),
    );
  });
});
