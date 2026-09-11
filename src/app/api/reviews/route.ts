/**
 * Public reviews (§30).
 * GET ?product=<id|slug> → approved reviews for one product.
 * GET ?featured=1&limit= → approved + featured stories across products.
 * POST { productId|slug, author?, rating, title?, body } → pending review.
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
    return apiJson({ reviews: ((data ?? []) as DbReview[]).map(mapReview) });
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
    await notifyStaff(db, {
      kind: "review",
      title: "Review awaiting moderation",
      body: `“${(data as DbReview).title || "Untitled"}” — ${rating}★ from ${(data as DbReview).author}.`,
      href: "/admin/reviews",
    });
    return apiJson({ review: mapReview(data as DbReview) }, 201);
  } catch {
    return apiError("Could not save the review.", 503);
  }
}
