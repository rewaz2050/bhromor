import type { Coupon } from "../coupons";
import { bdt } from "../format";

/**
 * The launch coupon set (mirrors scripts/seed-supabase.mjs and
 * src/lib/db/auto-seed.ts) — shared by the coupon and order-validation
 * tests so they price against the same rows the live order route uses.
 */
export const launchCoupons = (): Coupon[] => {
  const now = Date.now();
  const DAY = 86_400_000;
  return [
    {
      id: "c1",
      code: "WELCOME100",
      type: "fixed",
      value: bdt(100),
      minOrder: bdt(1000),
      description: "Welcome offer — ৳100 off on ৳1000+",
      validUntil: now + 90 * DAY,
      usageLimit: 500,
      used: 42,
      active: true,
    },
    {
      id: "c2",
      code: "SUNAMGANJ15",
      type: "percent",
      value: 15,
      maxDiscount: bdt(500),
      minOrder: bdt(500),
      zoneId: "z1",
      description: "15% off up to ৳500 — Zone A Traffic Point (Boropara, Shologhar)",
      validUntil: now + 30 * DAY,
      usageLimit: 200,
      used: 17,
      active: true,
    },
    {
      id: "c3",
      code: "EID50",
      type: "fixed",
      value: bdt(50),
      minOrder: 0,
      categoryId: "men",
      description: "Eid — ৳50 off on Men",
      validUntil: now + 7 * DAY,
      used: 3,
      active: true,
    },
    {
      id: "c4",
      code: "FREEDELIVERY",
      type: "free_delivery",
      value: 0,
      minOrder: bdt(500),
      description: "Free delivery — Sunamganj Sadar any zone",
      validUntil: now + 14 * DAY,
      usageLimit: 100,
      used: 8,
      active: true,
    },
    {
      id: "c5",
      code: "BOROPARA20",
      type: "percent",
      value: 20,
      maxDiscount: bdt(300),
      minOrder: bdt(800),
      zoneId: "z1",
      categoryId: "men",
      description: "Boropara special — 20% off up to ৳300 on Men",
      validUntil: now + 10 * DAY,
      usageLimit: 50,
      used: 5,
      active: true,
    },
  ];
};
