/**
 * GET /api/promo — promo info (disabled, flat delivery model).
 */

import { apiJson } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export async function GET() {
  return apiJson({ totalOrders: 0, limit: 0, remaining: 0, enabled: false });
}
