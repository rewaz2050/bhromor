/**
 * C2 (2026-09-28) — one bag, several shops.
 *
 * One order is one shop and stays that way: the shop packs its own parcel,
 * the ledger pays the shop its own share, and the vendor dashboard shows the
 * shop its own orders. So a bag with two shops' items becomes TWO orders from
 * ONE tap — and everything in here is about making that honest rather than
 * merely possible.
 *
 * What each shop's order carries for itself:
 *   • its own items, subtotal and parcel weight (delivery is priced per
 *     parcel, because two shops send two parcels);
 *   • its own delivery charge, and its own free-delivery threshold;
 *   • its own share of a percentage coupon (10% off is 10% off wherever the
 *     goods come from).
 *
 * What a basket has only ONE of, and therefore goes with the biggest order:
 * the tip, the gift wrap and the referral credit. A fixed-amount coupon is one
 * too — ৳100 off means ৳100 off the basket, not ৳100 off each shop.
 *
 * Pure: no clock, no database, no network.
 */

import { isCouponRedeemable, type Coupon, type CouponType } from "./coupons";

/** Mirrors ps_multi_order_max_shops() — one number, two places. */
export const MULTI_SHOP_MAX = 3;

/** What the checkout already assumes a piece weighs, per unit. */
export const BASKET_ITEM_WEIGHT_KG = 0.5;

export interface BasketLine {
  productId: string;
  variantLabel?: string;
  qty: number;
  unitPrice: number;
}

export interface ShopBasket {
  shopId: string;
  lines: BasketLine[];
  /** Units, not lines. */
  qty: number;
  subtotal: number;
  weightKg: number;
}

/**
 * Split a bag by the shop that sells each line. Shops appear in the order
 * they were added, so the screen lists parcels the way the bag does.
 */
export const groupBasketByShop = (
  lines: readonly BasketLine[],
  shopOf: (productId: string) => string | undefined | null,
  fallbackShopId: string,
): ShopBasket[] => {
  const order: string[] = [];
  const byShop = new Map<string, BasketLine[]>();
  for (const line of lines) {
    const shopId = shopOf(line.productId) || fallbackShopId || "unknown";
    if (!byShop.has(shopId)) {
      byShop.set(shopId, []);
      order.push(shopId);
    }
    byShop.get(shopId)?.push(line);
  }
  return order.map((shopId) => {
    const group = byShop.get(shopId) ?? [];
    return {
      shopId,
      lines: group,
      qty: group.reduce((n, l) => n + Math.max(1, l.qty), 0),
      subtotal: group.reduce((sum, l) => sum + l.unitPrice * Math.max(1, l.qty), 0),
      weightKg: round2(group.reduce((kg, l) => kg + BASKET_ITEM_WEIGHT_KG * Math.max(1, l.qty), 0)),
    };
  });
};

const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * The shop whose parcel carries the basket's single items: the biggest
 * order, ties going to the one picked first. It is the only fair way to put
 * one tip (or one gift wrap) on two parcels without asking a second question.
 */
export const primaryShopId = (groups: readonly ShopBasket[]): string | undefined => {
  let best: ShopBasket | undefined;
  for (const group of groups) {
    if (!best || group.subtotal > best.subtotal) best = group;
  }
  return best?.shopId;
};

export const isMultiShop = (groups: readonly ShopBasket[]): boolean => groups.length > 1;

export const tooManyShops = (groups: readonly ShopBasket[]): boolean =>
  groups.length > MULTI_SHOP_MAX;

/* ------------------------------------------------------------------ */
/* Coupons across shops                                                */
/* ------------------------------------------------------------------ */

export interface CouponPlanEntry {
  shopId: string;
  apply: boolean;
  /** Why this shop's parcel does not carry the code (when it does not). */
  reason?: string;
}

export interface CouponPlan {
  code: string;
  entries: CouponPlanEntry[];
  /** Set when the code cannot be used on ANY parcel of this basket. */
  refused?: string;
  /** Paisa of discount per shop (0 for a free-delivery code). */
  discountByShop: Record<string, number>;
  /** True when the code waives delivery on the parcels it applies to. */
  freeDelivery: boolean;
}

export interface PlanCouponInput {
  coupon: Coupon | null;
  groups: readonly ShopBasket[];
  zoneId?: string;
  now?: number;
  /** Shop name for "only for <shop>" — filled by the server from live rows. */
  shopName?: string;
}

/**
 * Which parcels a code may ride on.
 *
 * The guard rail: a code's VALUE must not multiply just because the basket
 * split. Percent and free-delivery are naturally per-parcel (10% of each is
 * 10% of the basket; free delivery is free delivery), but a FIXED amount has
 * to land somewhere once — otherwise "৳100 off" quietly becomes ৳200 off.
 */
export const planCouponAcrossShops = (input: PlanCouponInput): CouponPlan => {
  const { coupon, groups, zoneId, now = Date.now() } = input;
  const empty: CouponPlan = {
    code: coupon?.code ?? "",
    entries: groups.map((g) => ({ shopId: g.shopId, apply: false })),
    discountByShop: {},
    freeDelivery: false,
  };
  if (!coupon || groups.length === 0) return empty;

  const reasonFor = (group: ShopBasket): string | undefined => {
    const check = isCouponRedeemable(coupon, group.subtotal, zoneId, now);
    return check.ok ? undefined : (check.reason ?? "This code cannot be used.");
  };

  // A shop's own code (B3): it only ever discounts that shop's own goods,
  // because elsewhere it would be one shop funding another shop's sale.
  if (coupon.shopId) {
    const own = groups.find((g) => g.shopId === coupon.shopId);
    if (!own) {
      return {
        ...empty,
        refused: input.shopName
          ? `This code is only for ${input.shopName}'s products.`
          : "This code is only for the shop that issued it.",
      };
    }
    const reason = reasonFor(own);
    if (reason) return { ...empty, refused: reason };
    return {
      ...empty,
      entries: groups.map((g) => ({ shopId: g.shopId, apply: g.shopId === own.shopId })),
      discountByShop: { [own.shopId]: 0 },
      freeDelivery: false,
    };
  }

  const type: CouponType = coupon.type;
  const primary = primaryShopId(groups);

  if (type === "fixed") {
    const target = groups.find((g) => g.shopId === primary) ?? groups[0];
    const reason = reasonFor(target);
    if (reason) return { ...empty, refused: reason };
    return {
      ...empty,
      entries: groups.map((g) => ({
        shopId: g.shopId,
        apply: g.shopId === target.shopId,
        ...(g.shopId === target.shopId ? {} : { reason: "A fixed discount is used once per basket." }),
      })),
      discountByShop: { [target.shopId]: 0 },
      freeDelivery: false,
    };
  }

  // percent and free_delivery: every parcel that qualifies on its own.
  const entries: CouponPlanEntry[] = groups.map((g) => {
    const reason = reasonFor(g);
    return reason
      ? { shopId: g.shopId, apply: false, reason }
      : { shopId: g.shopId, apply: true };
  });
  if (entries.every((e) => !e.apply)) {
    return { ...empty, entries, refused: entries.find((e) => e.reason)?.reason ?? "This code cannot be used." };
  }
  return {
    ...empty,
    entries,
    discountByShop: Object.fromEntries(entries.filter((e) => e.apply).map((e) => [e.shopId, 0])),
    freeDelivery: type === "free_delivery",
  };
};

/** Does this parcel carry the code? (Convenience for the screens.) */
export const couponAppliesTo = (plan: CouponPlan | null, shopId: string): boolean =>
  !!plan?.entries.some((e) => e.shopId === shopId && e.apply);
