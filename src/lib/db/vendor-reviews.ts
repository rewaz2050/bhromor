/**
 * B2 (2026-09-28) — the reviews panel on /vendor, and the shop's reply.
 *
 * Read side: approved reviews of this shop's products, newest first, with the
 * product name (so the shop knows which piece is being talked about) and the
 * customer photos. The vendor RLS client is enough for both: the
 * `reviews vendor select own` and `review photos public read` policies already
 * allow exactly this, and nothing broader — a shop can never see a pending
 * review, which is staff's queue, not the shop's.
 *
 * Write side: one reply per review, written through the vendor's own client so
 * the `reviews vendor reply own` policy + the guard trigger in
 * 202609280002_review_replies.sql decide what is allowed (rows of other shops
 * are invisible → 404, and no other column can be touched even by a direct
 * Supabase call).
 */

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { AdminInputError } from "./admin";
import type { DbReview } from "./types";
import { mapReview } from "./mappers";
import { validateVendorReply } from "../vendor-reply";
import type { Review } from "../review-store";

export interface VendorReview extends Review {
  productName: string;
  productSlug: string;
  /** Customer photos (at most 3, approval rides the review's status). */
  photos: string[];
}

const PRODUCT_FALLBACK = "Product";

/** Approved reviews for this shop, newest first. Never throws into the page. */
export async function listVendorReviews(
  db: SupabaseClient,
  shopId: string,
  opts: { limit?: number } = {},
): Promise<VendorReview[]> {
  const limit = Math.max(1, Math.min(200, opts.limit ?? 100));
  const { data, error } = await db
    .from("reviews")
    .select("*")
    .eq("shop_id", shopId)
    .eq("status", "approved")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return [];
  const rows = (data ?? []) as DbReview[];
  if (rows.length === 0) return [];

  const productIds = [...new Set(rows.map((r) => r.product_id))];
  const names = new Map<string, { name: string; slug: string }>();
  const { data: products } = await db
    .from("products")
    .select("id,name,slug")
    .in("id", productIds);
  for (const p of (products ?? []) as { id: string; name: string; slug: string }[]) {
    names.set(p.id, { name: p.name, slug: p.slug });
  }

  const photos = new Map<string, string[]>();
  const { data: photoRows } = await db
    .from("review_photos")
    .select("review_id,url")
    .in("review_id", rows.map((r) => r.id));
  for (const p of (photoRows ?? []) as { review_id: string; url: string }[]) {
    const list = photos.get(p.review_id) ?? [];
    list.push(p.url);
    photos.set(p.review_id, list);
  }

  return rows.map((r) => ({
    ...mapReview(r),
    productName: names.get(r.product_id)?.name ?? PRODUCT_FALLBACK,
    productSlug: names.get(r.product_id)?.slug ?? "",
    photos: photos.get(r.id) ?? [],
  }));
}

/**
 * Write (or reword) the shop's reply on one of its own reviews.
 *
 * The client's email rides along as the audit stamp (`vendor_reply_by`); the
 * database sets `vendor_reply_at` in the guard trigger, because a client clock
 * is not evidence. A review the caller cannot see — another shop's row, or a
 * pending review staff has not approved — answers 404, never a silent no-op:
 * the shop must know the reply did not land.
 */
export async function saveVendorReply(
  db: SupabaseClient,
  input: { id: string; shopId: string; reply: unknown; by?: string | null },
): Promise<VendorReview> {
  const checked = validateVendorReply(input.reply);
  // 422, matching the public review form's own "say a little more" refusal:
  // the shop is told what to fix, not that the server broke.
  if (!checked.ok) {
    throw new AdminInputError(checked.error ?? "Write the reply first.", 422);
  }
  const { data, error } = await db
    .from("reviews")
    .update({
      vendor_reply: checked.value,
      vendor_reply_by: (input.by ?? "").trim().slice(0, 160) || null,
    })
    .eq("id", input.id)
    .eq("shop_id", input.shopId)
    .select("*")
    .maybeSingle();
  if (error || !data) {
    throw new AdminInputError("That review is not available to your shop.", 404);
  }
  const row = data as DbReview;
  const { data: product } = await db
    .from("products")
    .select("name,slug")
    .eq("id", row.product_id)
    .maybeSingle();
  const p = (product ?? {}) as { name?: string; slug?: string };
  return {
    ...mapReview(row),
    productName: p.name ?? PRODUCT_FALLBACK,
    productSlug: p.slug ?? "",
    photos: [],
  };
}
