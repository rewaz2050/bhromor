/**
 * GET /api/promo — the live promo state the storefront renders with.
 *
 * One small public read of the ops document through the service-role client:
 * the flash window, the countdown deadline and the bundle rule. Nothing
 * staff-only is in the payload (see `promoView`), and the checkout does NOT
 * trust this answer — it re-reads the same settings server-side and recomputes
 * every taka (see lib/order-validation.ts).
 *
 * The storefront layout no longer waits for this call: it seeds the client
 * store from `readPromoSeed()` (the same function, read on the server), so
 * the first paint already carries the bar and the prices. This route is what
 * refreshes them afterwards — when a window opens or closes, and on any page
 * the layout did not seed.
 *
 * Unconfigured backend → an honest "nothing is running" (flash off), never a
 * stale cached sale.
 */

import { readPromoSeed } from "@/lib/db/promo";
import { apiJson } from "@/lib/api-response";
import { publicJson } from "@/lib/public-cache";

export const dynamic = "force-dynamic";

export async function GET() {
  const seed = await readPromoSeed();
  // Unconfigured backend → no-store, so the moment the shop configures a
  // drop this answer is live.
  if (!seed.live) return apiJson({ source: "none", ...seed });
  // Edge-cached 60 s (speed pass): identical for every visitor, and the
  // checkout recomputes every taka server-side, so a ≤60 s stale flag can
  // never mist-price an order.
  return publicJson({ source: "live", ...seed });
}
