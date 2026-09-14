/**
 * Live shopping sessions (P1 #9) — data access.
 *
 * The shop streams on its own platform; these tables hold the shopping
 * surface around that real stream. All reads/writes go through the
 * service-role client the routes already require — RLS stays fully closed.
 *
 * Public read: getPublicLive() powers GET /api/live (the storefront).
 * Admin: list/create/update/start/end/delete + setShowing for /admin/live.
 */

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { LiveSession, LiveSessionProduct } from "../live";
import { parseStreamUrl } from "../live";
import { AdminInputError } from "./admin";
import type { DbLiveSession, DbLiveSessionProduct, DbProduct, DbMedia } from "./types";

const epoch = (iso: string | null): number | undefined =>
  iso ? new Date(iso).getTime() : undefined;

/** First image per product (sort_order), the same convention as checkout. */
const firstImages = (media: DbMedia[]): Map<string, string> => {
  const map = new Map<string, string>();
  for (const m of media) {
    if (m.type === "image" && !map.has(m.product_id)) map.set(m.product_id, m.url);
  }
  return map;
};

async function hydrateSessions(
  db: SupabaseClient,
  rows: DbLiveSession[],
): Promise<LiveSession[]> {
  if (rows.length === 0) return [];
  const sessionIds = rows.map((r) => r.id);
  const [itemsRes, mediaRes] = await Promise.all([
    db
      .from("live_session_products")
      .select("*")
      .in("session_id", sessionIds)
      .order("position", { ascending: true }),
    db.from("product_media").select("*").order("sort_order"),
  ]);
  if (itemsRes.error) throw new Error("Could not load live session pieces.");
  const items = (itemsRes.data ?? []) as DbLiveSessionProduct[];

  // Product details for every featured id (one query).
  const featuredIds = [...new Set(items.map((i) => i.product_id))];
  let products: Pick<DbProduct, "id" | "name" | "slug" | "price" | "in_stock">[] =
    [];
  if (featuredIds.length > 0) {
    const pRes = await db
      .from("products")
      .select("id, name, slug, price, in_stock, status, active")
      .in("id", featuredIds);
    if (pRes.error) throw new Error("Could not load live session pieces.");
    products = (pRes.data ?? []) as typeof products;
  }
  const byId = new Map(products.map((p) => [p.id, p]));
  const images = firstImages((mediaRes.data ?? []) as DbMedia[]);

  // First active variant per product → the Quick Add label (cart rule).
  const variantLabel = new Map<string, string>();
  if (featuredIds.length > 0) {
    const vRes = await db
      .from("product_variants")
      .select("product_id, color, size")
      .in("product_id", featuredIds)
      .eq("active", true);
    if (!vRes.error) {
      for (const v of (vRes.data ?? []) as { product_id: string; color: string; size: string }[]) {
        if (variantLabel.has(v.product_id)) continue;
        if (v.color && v.size && v.size !== "Free Size" && v.size !== "One Size")
          variantLabel.set(v.product_id, `${v.color} · ${v.size}`);
        else variantLabel.set(v.product_id, v.color || v.size || "Default");
      }
    }
  }

  const bySession = new Map<string, LiveSessionProduct[]>();
  for (const it of items) {
    const p = byId.get(it.product_id);
    if (!p) continue; // product unpublished since — drop it, keep the rest
    const list = bySession.get(it.session_id) ?? [];
    if (list.length < 30)
      list.push({
        productId: p.id,
        name: p.name,
        slug: p.slug,
        price: p.price,
        image: images.get(p.id),
        inStock: p.in_stock,
        defaultVariantLabel: variantLabel.get(p.id) ?? "Default",
        onAir: false,
      });
    bySession.set(it.session_id, list);
  }

  return rows.map((r) => {
    const { url, youtubeId } = parseStreamUrl(r.stream_url);
    const products = (bySession.get(r.id) ?? []).filter(
      (p) => p.productId !== r.showing_product_id,
    );
    const showing =
      r.showing_product_id != null
        ? (bySession.get(r.id) ?? []).find((p) => p.productId === r.showing_product_id)
        : undefined;
    if (showing) {
      showing.onAir = true;
      // "On air" first, the rest keep the shop's order.
      products.unshift(showing);
    }
    return {
      id: r.id,
      title: r.title,
      description: r.description,
      streamUrl: url,
      youtubeId,
      scheduledStart: new Date(r.scheduled_start).getTime(),
      liveAt: epoch(r.live_at),
      endedAt: epoch(r.ended_at),
      status: r.status,
      products,
    };
  });
}

/* ------------------------------------------------------------------ */
/* Public read — the storefront's one question: what's on, what's next */
/* ------------------------------------------------------------------ */

export async function getPublicLive(
  db: SupabaseClient,
): Promise<{ live: LiveSession | null; upcoming: LiveSession | null }> {
  const [liveRes, upcomingRes] = await Promise.all([
    db
      .from("live_sessions")
      .select("*")
      .eq("status", "live")
      .order("live_at", { ascending: false })
      .limit(1),
    db
      .from("live_sessions")
      .select("*")
      .eq("status", "scheduled")
      .order("scheduled_start", { ascending: true })
      .limit(1),
  ]);
  if (liveRes.error || upcomingRes.error)
    throw new Error("Could not load live shopping.");
  const [live, upcoming] = await Promise.all([
    hydrateSessions(db, (liveRes.data ?? []) as DbLiveSession[]),
    hydrateSessions(db, (upcomingRes.data ?? []) as DbLiveSession[]),
  ]);
  return { live: live[0] ?? null, upcoming: upcoming[0] ?? null };
}

/* ------------------------------------------------------------------ */
/* Admin                                                               */
/* ------------------------------------------------------------------ */

export async function listLiveSessions(
  db: SupabaseClient,
): Promise<LiveSession[]> {
  const res = await db
    .from("live_sessions")
    .select("*")
    .order("scheduled_start", { ascending: false })
    .limit(100);
  if (res.error) throw new Error("Could not load live sessions.");
  return hydrateSessions(db, (res.data ?? []) as DbLiveSession[]);
}

/** Real published+active catalog ids — the only pieces a session may show. */
export async function liveCatalogProductIds(
  db: SupabaseClient,
): Promise<Set<string>> {
  const res = await db
    .from("products")
    .select("id")
    .eq("status", "published")
    .eq("active", true);
  if (res.error) throw new Error("Could not load the catalog.");
  return new Set(((res.data ?? []) as { id: string }[]).map((r) => r.id));
}

export async function createLiveSession(
  db: SupabaseClient,
  value: { title: string; description: string; streamUrl: string; youtubeId: string | null; startsAt: number },
  productIds: string[],
): Promise<LiveSession> {
  const { data, error } = await db
    .from("live_sessions")
    .insert({
      title: value.title,
      description: value.description,
      stream_url: value.streamUrl,
      scheduled_start: new Date(value.startsAt).toISOString(),
      status: "scheduled",
    })
    .select("id")
    .single();
  if (error || !data)
    throw new AdminInputError("Could not create the session.", 422);
  return replaceSessionProducts(db, (data as { id: string }).id, productIds);
}

export async function updateLiveSession(
  db: SupabaseClient,
  id: string,
  value: { title: string; description: string; streamUrl: string; youtubeId: string | null; startsAt: number },
  productIds: string[],
): Promise<LiveSession> {
  const { data, error } = await db
    .from("live_sessions")
    .select("*")
    .eq("id", id)
    .single();
  if (error || !data) throw new AdminInputError("Session not found.", 404);
  const row = data as DbLiveSession;
  if (row.status !== "scheduled")
    throw new AdminInputError(
      "A session can only be edited before it starts.",
      422,
    );

  const { error: patchError } = await db
    .from("live_sessions")
    .update({
      title: value.title,
      description: value.description,
      stream_url: value.streamUrl,
      scheduled_start: new Date(value.startsAt).toISOString(),
    })
    .eq("id", id);
  if (patchError)
    throw new AdminInputError("Could not update the session.", 422);
  return replaceSessionProducts(db, id, productIds);
}

async function replaceSessionProducts(
  db: SupabaseClient,
  sessionId: string,
  productIds: string[],
): Promise<LiveSession> {
  const { error: delError } = await db
    .from("live_session_products")
    .delete()
    .eq("session_id", sessionId);
  if (delError) throw new AdminInputError("Could not update the pieces.", 422);
  const rows = productIds.map((product_id, i) => ({
    session_id: sessionId,
    product_id,
    position: i + 1,
  }));
  if (rows.length > 0) {
    const { error: insError } = await db.from("live_session_products").insert(rows);
    if (insError) throw new AdminInputError("Could not update the pieces.", 422);
  }
  const res = await db
    .from("live_sessions")
    .select("*")
    .eq("id", sessionId)
    .single();
  if (res.error || !res.data) throw new AdminInputError("Session not found.", 404);
  const [session] = await hydrateSessions(db, [res.data as DbLiveSession]);
  return session;
}

export async function startLiveSession(
  db: SupabaseClient,
  id: string,
): Promise<LiveSession> {
  const { data, error } = await db
    .from("live_sessions")
    .select("*")
    .eq("id", id)
    .single();
  if (error || !data) throw new AdminInputError("Session not found.", 404);
  const row = data as DbLiveSession;
  if (row.status === "live")
    throw new AdminInputError("This session is already live.", 409);
  if (row.status === "ended")
    throw new AdminInputError("This session has ended.", 422);
  if (!row.stream_url.trim())
    throw new AdminInputError(
      "Add the live link before starting — the page embeds that stream.",
      422,
    );
  const { error: patchError } = await db
    .from("live_sessions")
    .update({ status: "live", live_at: new Date().toISOString() })
    .eq("id", id);
  if (patchError)
    throw new AdminInputError("Could not start the session.", 422);
  const res = await db.from("live_sessions").select("*").eq("id", id).single();
  if (res.error || !res.data) throw new AdminInputError("Session not found.", 404);
  const [session] = await hydrateSessions(db, [res.data as DbLiveSession]);
  return session;
}

export async function endLiveSession(
  db: SupabaseClient,
  id: string,
): Promise<LiveSession> {
  const { data, error } = await db
    .from("live_sessions")
    .select("*")
    .eq("id", id)
    .single();
  if (error || !data) throw new AdminInputError("Session not found.", 404);
  const row = data as DbLiveSession;
  if (row.status === "ended")
    throw new AdminInputError("This session has already ended.", 409);
  const { error: patchError } = await db
    .from("live_sessions")
    .update({ status: "ended", ended_at: new Date().toISOString() })
    .eq("id", id);
  if (patchError)
    throw new AdminInputError("Could not end the session.", 422);
  const res = await db.from("live_sessions").select("*").eq("id", id).single();
  if (res.error || !res.data) throw new AdminInputError("Session not found.", 404);
  const [session] = await hydrateSessions(db, [res.data as DbLiveSession]);
  return session;
}

/** The one piece on air — must belong to this (live) session. */
export async function setShowingProduct(
  db: SupabaseClient,
  id: string,
  productId: string | null,
): Promise<LiveSession> {
  const { data, error } = await db
    .from("live_sessions")
    .select("*")
    .eq("id", id)
    .single();
  if (error || !data) throw new AdminInputError("Session not found.", 404);
  const row = data as DbLiveSession;
  if (row.status !== "live")
    throw new AdminInputError("Set the on-air piece while the session is live.", 422);

  if (productId) {
    const member = await db
      .from("live_session_products")
      .select("product_id")
      .eq("session_id", id)
      .eq("product_id", productId)
      .maybeSingle();
    if (member.error || !member.data)
      throw new AdminInputError("That piece is not in this session.", 422);
  }

  const { error: patchError } = await db
    .from("live_sessions")
    .update({ showing_product_id: productId })
    .eq("id", id);
  if (patchError)
    throw new AdminInputError("Could not update the on-air piece.", 422);
  const res = await db.from("live_sessions").select("*").eq("id", id).single();
  if (res.error || !res.data) throw new AdminInputError("Session not found.", 404);
  const [session] = await hydrateSessions(db, [res.data as DbLiveSession]);
  return session;
}

/** Only scheduled sessions can be deleted — live/ended keep their record. */
export async function deleteLiveSession(
  db: SupabaseClient,
  id: string,
): Promise<void> {
  const { data, error } = await db
    .from("live_sessions")
    .select("*")
    .eq("id", id)
    .single();
  if (error || !data) throw new AdminInputError("Session not found.", 404);
  const row = data as DbLiveSession;
  if (row.status !== "scheduled")
    throw new AdminInputError(
      "Only a scheduled session can be deleted — live and ended ones keep their record.",
      422,
    );
  const { error: delError } = await db
    .from("live_sessions")
    .delete()
    .eq("id", id);
  if (delError) throw new AdminInputError("Could not delete the session.", 422);
}
