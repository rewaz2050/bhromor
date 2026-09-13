/**
 * GET /api/payments — the wallet numbers the storefront may offer (P1 #8).
 *
 * Returns { bkash?: "01…", nagad?: "01…" } from the ops settings — the shop's
 * OWN wallet numbers (no merchant account, no API). A method with no number is
 * omitted, so checkout offers COD only until the shop configures one. Read
 * failures answer 503: the checkout then offers COD, which always works.
 */
import { getSupabaseService } from "@/lib/supabase-server";
import { apiError, apiJson } from "@/lib/api-response";

export const dynamic = "force-dynamic";

const BD_MOBILE = /^01\d{9}$/;

export async function GET() {
  const db = getSupabaseService();
  if (!db) return apiError("Payment options are temporarily unavailable.", 503);
  try {
    const { data, error } = await db
      .from("site_settings")
      .select("value")
      .eq("key", "ops")
      .maybeSingle();
    if (error) return apiError("Payment options are temporarily unavailable.", 503);
    const ops = (data?.value ?? {}) as Record<string, unknown>;
    const wallets = (ops.wallets ?? {}) as Record<string, unknown>;
    const clean = (v: unknown): string | undefined => {
      let digits = typeof v === "string" ? v.replace(/\D/g, "") : "";
      if (digits.length > 11 && digits.startsWith("88")) digits = digits.slice(2);
      return BD_MOBILE.test(digits) ? digits : undefined;
    };
    return apiJson({
      bkash: clean(wallets.bkash),
      nagad: clean(wallets.nagad),
    });
  } catch {
    return apiError("Payment options are temporarily unavailable.", 503);
  }
}
