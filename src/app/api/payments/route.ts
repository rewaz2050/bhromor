/**
 * GET /api/payments?shops=a,b — the wallet numbers checkout may offer for THIS bag (P1 #8).
 *
 * Returns { bkash?: "01…", nagad?: "01…", payTo, payeeName? }. By default the numbers are
 * PROSANTI's own (ops settings; no merchant account, no API). A shop that sells into its OWN
 * wallet (migration 202610020013) is paid on its own number instead — but only when it is the
 * bag's single shop; a bag mixing such a shop with another gets no wallet at all, because one
 * payment cannot be split between two wallets (COD always works). A method with no number is
 * omitted. Read failures answer 503: checkout then offers COD.
 */
import { getSupabaseService } from "@/lib/supabase-server";
import { apiError, apiJson } from "@/lib/api-response";
import { normalizeWalletNumber, parseSettlementModel, walletsForCart, type CartShop } from "@/lib/shop-settlement";

export const dynamic = "force-dynamic";

const SHOP_ID = /^[0-9a-f-]{36}$/i;

export async function GET(request?: Request) {
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
    const clean = (v: unknown): string | undefined => normalizeWalletNumber(v) || undefined;
    const platform = { bkash: clean(wallets.bkash), nagad: clean(wallets.nagad) };

    const ids = [...new Set((request ? (new URL(request.url).searchParams.get("shops") ?? "") : "").split(",").map((s) => s.trim()).filter((s) => SHOP_ID.test(s)))].slice(0, 12);
    let shops: CartShop[] = [];
    if (ids.length > 0) {
      const res = await db.from("shops").select("id,name,settlement_model,wallet_bkash,wallet_nagad").in("id", ids);
      // A database without migration 202610020013 has no such columns: every shop is "platform".
      if (!res.error) {
        shops = ((res.data ?? []) as { id: string; name?: string; settlement_model?: string | null; wallet_bkash?: string | null; wallet_nagad?: string | null }[]).map((r) => ({
          id: r.id,
          name: r.name,
          settlementModel: parseSettlementModel(r.settlement_model),
          wallets: { bkash: clean(r.wallet_bkash), nagad: clean(r.wallet_nagad) },
        }));
      }
    }
    return apiJson(walletsForCart(platform, shops));
  } catch {
    return apiError("Payment options are temporarily unavailable.", 503);
  }
}
