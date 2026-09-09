/**
 * Staff coupons (§56). GET → full list. POST → upsert coupon.
 * Usage counts are server-owned: input `used` is always ignored.
 */
import { listCouponsFull, upsertCoupon } from "@/lib/db/admin";
import { apiJson } from "@/lib/api-response";
import { staffRoute } from "../_lib";

export const dynamic = "force-dynamic";

export const GET = staffRoute("coupons-list", async ({ db }) => {
  const coupons = await listCouponsFull(db);
  return apiJson({ coupons });
});

export const POST = staffRoute(
  "coupons-write",
  async ({ db }, request) => {
    const body: unknown = await request.json().catch(() => null);
    const coupon = await upsertCoupon(db, body);
    return apiJson({ coupon });
  },
  { limit: 30 },
);
