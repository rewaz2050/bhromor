/**
 * Public reviews (§30) + customer photos (P1 #10 UGC).
 * GET ?product=<id|slug> → approved reviews for one product, with photos.
 * GET ?featured=1&limit= → approved + featured stories across products.
 * POST { productId|slug, author?, rating, title?, body, photos? } → pending
 * review. `photos` is at most 3 browser-compressed JPEG data URLs; when
 * Cloudinary is configured the server re-hosts them (prosanti/reviews),
 * otherwise the compressed data URL is stored — either way the photos ride
 * the review's pending state (RLS keeps them hidden until approved).
 *
 * An unconfigured backend answers an empty list / 503 — the client shows
 * browser-local store. Submissions are never auto-approved and never
 * auto-verified — both need a human or a proven order.
 */

import { getSupabaseServer, getSupabaseService } from "@/lib/supabase-server";
import { notifyStaff } from "@/lib/db/engagement";
import { mapReview } from "@/lib/db/mappers";
import type { DbReview } from "@/lib/db/types";
import { isServiceRoleConfigured, isSupabaseConfigured } from "@/lib/env";
import { clientIpFromHeaders } from "@/lib/rate-limit";
import { checkDurableRateLimit } from "@/lib/rate-limit-durable";
import { apiError, apiJson } from "@/lib/api-response";
import { publicJson } from "@/lib/public-cache";
import { isUuid } from "@/lib/db/order-lookup";
import { provenPurchase } from "@/lib/db/orders";
import { resolveCustomer } from "@/lib/customer-auth";
import { normalizePhone } from "@/lib/orders";
import { isFitKey } from "@/lib/review-fit";
import {
  attachReviewPhotos,
  sanitizeReviewPhotos,
  storeReviewPhotos,
} from "@/lib/review-photos";

/**
 * Fetch photo URLs for the given review ids with the ANON client: the
 * review_photos read policy returns photos of approved reviews only, and
 * this route only ever lists approved reviews — so the RLS policy is the
 * gate, not code. Photos failing never sinks the review list itself.
 */
async function photosForReviews(
  db: Awaited<ReturnType<typeof getSupabaseServer>>,
  reviews: { id: string }[],
): Promise<Map<string, string[]>> {
  const empty = new Map<string, string[]>();
  if (!db || reviews.length === 0) return empty;
  try {
    const { data, error } = await db
      .from("review_photos")
      .select("review_id,url")
      .in("review_id", reviews.map((r) => r.id));
    if (error || !data) return empty;
    const byReview = new Map<string, string[]>();
    for (const p of data as { review_id: string; url: string }[]) {
      const list = byReview.get(p.review_id) ?? [];
      list.push(p.url);
      byReview.set(p.review_id, list);
    }
    return byReview;
  } catch {
    return empty;
  }
}

export const dynamic = "force-dynamic";

/**
 * A column this deployment's database does not have yet: Postgres 42703, or
 * PostgREST refusing the payload (PGRST204) because the column is not in its
 * schema cache. The review is kept either way — the fit answer is a bonus,
 * never a reason to lose what somebody wrote.
 */
const isMissingColumn = (error: { code?: string; message?: string }): boolean =>
  error?.code === "42703" ||
  error?.code === "PGRST204" ||
  /column .* does not exist/i.test(error?.message ?? "");

const clean = (value: unknown, max: number): string =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

export async function GET(request: Request) {
  if (!isSupabaseConfigured()) {
    return apiJson({ reviews: [] });
  }
  const url = new URL(request.url);
  const product = clean(url.searchParams.get("product"), 160);
  const featuredOnly = url.searchParams.get("featured") === "1";
  const limit = Math.max(1, Math.min(24, Number(url.searchParams.get("limit") ?? 12) || 12));

  try {
    const db = await getSupabaseServer();
    if (!db) return apiJson({ reviews: [] });
    let productId: string | null = null;
    if (product !== "") {
      // Accept the public slug or the internal id. The id is the real key —
      // C5 lets two shops sell a piece of the same name, so a slug can answer
      // more than one piece; `.limit(1)` keeps this read working instead of
      // erroring on two rows, and the storefront always sends the id.
      const { data: bySlug } = await db
        .from("products")
        .select("id")
        .eq("slug", product)
        .limit(1);
      productId =
        ((bySlug as { id: string }[] | null)?.[0]?.id ?? null) || product;
    }
    let query = db
      .from("reviews")
      .select("*")
      .eq("status", "approved")
      .order("featured", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(productId ? 100 : limit);
    if (productId) query = query.eq("product_id", productId);
    if (featuredOnly) query = query.eq("featured", true);
    const { data, error } = await query;
    if (error) return apiError("Reviews are temporarily unavailable.", 503);
    const reviews = ((data ?? []) as DbReview[]).map(mapReview);
    const photos = await photosForReviews(db, reviews);
    // Edge-cached 60 s per URL (speed pass): approved reviews are public
    // and identical for every visitor; each ?product=/featured combo is its
    // own cache key. Submissions (POST below) stay uncached.
    return publicJson({ reviews: attachReviewPhotos(reviews, photos) });
  } catch {
    return apiError("Reviews are temporarily unavailable.", 503);
  }
}

export async function POST(request: Request) {
  const ip = clientIpFromHeaders(request.headers);
  const bucket = await checkDurableRateLimit(`reviews:${ip}`, 10, 60_000);
  if (!bucket.allowed) {
    const res = apiError("Too many attempts — please wait a moment.", 429);
    res.headers.set("Retry-After", String(bucket.retryAfterSec));
    return res;
  }
  if (!isServiceRoleConfigured()) {
    return apiError("Reviews are temporarily unavailable.", 503);
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Invalid review.", 400);
  }
  const b = (body ?? {}) as Record<string, unknown>;
  const productRef = clean(b.productId ?? b.slug, 160);
  const rating = typeof b.rating === "number" ? Math.floor(b.rating) : 0;
  const reviewBody = clean(b.body, 2000);
  if (productRef === "") return apiError("Product is required.", 400);
  if (rating < 1 || rating > 5) return apiError("Pick a star rating first.", 422);
  if (reviewBody.length < 10) {
    return apiError("Tell us a little more — at least a sentence.", 422);
  }

  try {
    const db = getSupabaseService();
    if (!db) return apiError("Reviews are temporarily unavailable.", 503);
    // Accept the internal id or the public slug. Only compare against the
    // uuid column when the value is one — `id = 'some-slug'::uuid` raises
    // 22P02 and would fail the whole lookup.
    const { data: product } = await db
      .from("products")
      .select("id")
      .eq(isUuid(productRef) ? "id" : "slug", productRef)
      .eq("status", "published")
      .eq("active", true)
      .maybeSingle();
    const productId = (product as { id: string } | null)?.id;
    if (!productId) return apiError("That product is not available.", 422);
    // Customer photos: at most 3, already server-sanitized (shape, count,
    // size). Re-hosted to Cloudinary when configured; stored as the
    // compressed data URL otherwise. Photo problems never lose the review.
    const photos = sanitizeReviewPhotos(b.photos).dataUrls;
    // Verified purchase (UX plan §4/§7, R10): a delivered order on this
    // phone that contains the piece. The phone comes from the track page's
    // proof (order no + phone, checked against the row) or from the
    // signed-in account — never from the form alone. A proven review earns
    // a Smart Card stamp when staff approve it (migration 202609270004).
    let proof: { phone: string; orderNo: string } | null = null;
    try {
      const claimedPhone = normalizePhone(clean(b.phone, 20));
      const claimedOrder = clean(b.orderId, 40);
      const customer = await resolveCustomer(request);
      const candidates = [
        claimedPhone !== "" ? { phone: claimedPhone, orderNo: claimedOrder || undefined } : null,
        customer ? { phone: customer.phone, orderNo: undefined } : null,
      ].filter((c): c is { phone: string; orderNo: string | undefined } => c !== null);
      for (const c of candidates) {
        const hit = await provenPurchase(db, { phone: c.phone, productId, orderNo: c.orderNo });
        if (hit) {
          proof = { phone: normalizePhone(c.phone), orderNo: hit.orderNo };
          break;
        }
      }
    } catch {
      proof = null;
    }
    // Fit answer (fit-data pass 2026-10-06): one tap on the form, stored with
    // the review and shown on the product page once enough are approved.
    const fit = isFitKey(b.fit) ? b.fit : null;
    const baseRow = {
      product_id: productId,
      author: clean(b.author, 80) || "Anonymous customer",
      rating,
      title: clean(b.title, 120) || null,
      body: reviewBody,
      status: "pending",
      verified: proof !== null,
      featured: false,
    };
    const withFit: Record<string, unknown> = fit ? { ...baseRow, fit } : baseRow;
    const fullRow: Record<string, unknown> = proof
      ? { ...withFit, customer_phone: proof.phone, order_ref: proof.orderNo }
      : withFit;
    const insert = () => db.from("reviews").insert(fullRow).select("*").single();
    const insertWithoutProof = () =>
      db.from("reviews").insert(withFit).select("*").single();
    const insertWithoutFit = () =>
      db.from("reviews").insert(baseRow).select("*").single();

    let inserted = await insert();
    if (inserted.error && proof) {
      // Migration 202609270004 not run yet — keep the review, drop the proof columns.
      inserted = await insertWithoutProof();
    }
    if (inserted.error && fit && isMissingColumn(inserted.error)) {
      // Migration 202610060001 not run yet — keep the review, drop the fit.
      inserted = await insertWithoutFit();
    }
    const { data, error } = inserted;
    if (error || !data) return apiError("Could not save the review.", 503);
    let storedPhotos: string[] = [];
    if (photos.length > 0) {
      const stored = await storeReviewPhotos(photos);
      const { error: photoError } = await db
        .from("review_photos")
        .insert(stored.map((url) => ({ review_id: (data as DbReview).id, url })));
      if (!photoError) storedPhotos = stored;
    }
    await notifyStaff(db, {
      kind: "review",
      title: "Review awaiting moderation",
      body: `“${(data as DbReview).title || "Untitled"}” — ${rating}★ from ${(data as DbReview).author}${
        storedPhotos.length > 0 ? ` · ${storedPhotos.length} photo${storedPhotos.length === 1 ? "" : "s"}` : ""
      }.`,
      href: "/admin/reviews",
    });
    return apiJson(
      {
        review: { ...mapReview(data as DbReview), photos: storedPhotos },
        // The form tells the shopper a stamp is coming only when it really is.
        stampEligible: proof !== null,
      },
      201,
    );
  } catch {
    return apiError("Could not save the review.", 503);
  }
}
