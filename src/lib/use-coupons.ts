"use client";

import { useSyncExternalStore } from "react";
import {
  deleteCouponInStore,
  getCoupons,
  getCouponsServer,
  recordCouponUseInStore,
  resetCoupons,
  saveCouponInStore,
  subscribeCoupons,
} from "./coupons-store";
import type { Coupon } from "./coupons";

export function useCoupons() {
  const coupons = useSyncExternalStore(
    subscribeCoupons,
    getCoupons,
    getCouponsServer,
  );

  return {
    coupons,
    save: (c: Coupon) => saveCouponInStore(c),
    remove: (id: string) => deleteCouponInStore(id),
    recordUse: (code: string) => recordCouponUseInStore(code),
    reset: resetCoupons,
  };
}
