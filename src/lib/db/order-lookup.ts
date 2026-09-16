/**
 * Guest-facing order lookup shared by the /api/track sub-routes.
 *
 * The storefront never holds an order's uuid — `mapOrder` publishes
 * `order_no` (PS-YYYYMMDD-XXXX) as `id` — so the tracking widgets send the
 * order number. The previous lookup did
 *
 *   .or(`id.eq.${ref},order_no.eq.${ref}`)
 *
 * which PostgREST compiles to `id = 'PS-…'::uuid` → SQLSTATE 22P02 on every
 * call, i.e. the live map and reschedule always answered "order not found".
 * Only compare against `id` when the reference actually looks like a uuid.
 *
 * Ownership proof is the same as /api/track: the phone the order was placed
 * with. Callers must answer a vague 404 whether the id or the phone was
 * wrong (do not distinguish).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizePhone } from "../orders";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Only characters an order number / uuid can contain — keeps the value
 *  safe to embed in a PostgREST filter string. */
const REF_RE = /^[A-Za-z0-9-]{1,64}$/;

export const isUuid = (value: string): boolean => UUID_RE.test(value.trim());

export interface OwnedOrderLookup<Row> {
  /** The row, or null when unknown / not configured / phone mismatch. */
  order: Row | null;
}

/**
 * Fetch `columns` of the order referenced by `ref` (order number or uuid)
 * and verify `phone` against `customer_phone`. `columns` must include
 * `customer_phone`.
 */
export async function findOwnedOrder<Row extends { customer_phone?: string | null }>(
  db: SupabaseClient,
  ref: string,
  phone: string,
  columns: string,
): Promise<Row | null> {
  const clean = ref.trim();
  if (!REF_RE.test(clean)) return null;
  let query = db.from("orders").select(columns);
  query = isUuid(clean)
    ? query.eq("id", clean.toLowerCase())
    : query.eq("order_no", clean.toUpperCase());
  const { data, error } = await query.maybeSingle();
  if (error || !data) return null;
  const row = data as unknown as Row;
  const stored = normalizePhone(row.customer_phone ?? "");
  if (stored === "" || stored !== normalizePhone(phone)) return null;
  return row;
}
