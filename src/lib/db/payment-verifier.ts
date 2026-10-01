import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DEFAULT_PAYMENT_VERIFIER,
  parsePaymentVerifier,
  type PaymentVerifier,
} from "@/lib/payment-verifier";

/**
 * The shop's payment-verifier setting for ONE order read (audit N6). A
 * database without migration 202610010002 has no column — that reads as
 * "both", the behaviour before the setting existed, never as an error.
 */
export async function shopPaymentVerifier(
  db: SupabaseClient,
  shopId: string | undefined | null,
): Promise<PaymentVerifier> {
  if (!shopId) return DEFAULT_PAYMENT_VERIFIER;
  const { data, error } = await db
    .from("shops")
    .select("payment_verifier")
    .eq("id", shopId)
    .maybeSingle();
  if (error || !data) return DEFAULT_PAYMENT_VERIFIER;
  return parsePaymentVerifier((data as { payment_verifier?: unknown }).payment_verifier);
}
