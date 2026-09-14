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
import { checkRateLimit, clientIpFromHeaders } from "@/lib/rate-limit";
import { apiError, apiJson } from "@/lib/api-response";
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
      // Accept the public slug or the internal id.
      const { data: bySlug } = await db
        .from("products")
        .select("id")
        .eq("slug", product)
        .single();
      productId =
        ((bySlug as { id: string } | null)?.id ?? null) || product;
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
    return apiJson({ reviews: attachReviewPhotos(reviews, photos) });
  } catch {
    return apiError("Reviews are temporarily unavailable.", 503);
  }
}

export async function POST(request: Request) {
  const ip = clientIpFromHeaders(request.headers);
  const bucket = checkRateLimit(`reviews:${ip}`, 10, 60_000);
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
    const { data: product } = await db
      .from("products")
      .select("id")
      .or(`id.eq.${productRef},slug.eq.${productRef}`)
      .eq("status", "published")
      .eq("active", true)
      .single();
    const productId = (product as { id: string } | null)?.id;
    if (!productId) return apiError("That product is not available.", 422);
    // Customer photos: at most 3, already server-sanitized (shape, count,
    // size). Re-hosted to Cloudinary when configured; stored as the
    // compressed data URL otherwise. Photo problems never lose the review.
    const photos = sanitizeReviewPhotos(b.photos).dataUrls;
    const { data, error } = await db
      .from("reviews")
      .insert({
        product_id: productId,
        author: clean(b.author, 80) || "Anonymous customer",
        rating,
        title: clean(b.title, 120) || null,
        body: reviewBody,
        status: "pending",
        verified: false,
        featured: false,
      })
      .select("*")
      .single();
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
      { review: { ...mapReview(data as DbReview), photos: storedPhotos } },
      201,
    );
  } catch {
    return apiError("Could not save the review.", 503);
  }
}
