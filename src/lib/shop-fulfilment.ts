/** Shop-owned fulfilment versus platform operations. Pure shared policy;
 * SQL and API authorization still enforce this independently of the UI. */
export const SHOP_FULFILMENT_TARGETS = ["confirmed", "preparing", "ready-for-pickup"] as const;
export type ShopFulfilmentTarget = (typeof SHOP_FULFILMENT_TARGETS)[number];
export const OVERRIDE_REASON_MIN = 10;
export const OVERRIDE_REASON_MAX = 300;

export const isShopFulfilmentTarget = (to: string): to is ShopFulfilmentTarget =>
  (SHOP_FULFILMENT_TARGETS as readonly string[]).includes(to);

export const isShopFulfilment = (
  order: { shopId?: string | null; isReturn?: boolean },
  to: string,
): boolean => Boolean(order.shopId) && !order.isReturn && isShopFulfilmentTarget(to);

export const validOverrideReason = (note: string): boolean =>
  note.trim().length >= OVERRIDE_REASON_MIN && note.trim().length <= OVERRIDE_REASON_MAX;
