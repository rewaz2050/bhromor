/**
 * UX plan §10 (R10) — GET /api/live also answers `last`: the most recent
 * ended session (≤ 60 days) whose pieces are still published. A newer
 * session whose pieces all vanished does not block the one before it; an
 * ended-list read error never breaks live/upcoming.
 */
import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("server-only", () => ({}));

const NOW = Date.UTC(2026, 8, 27, 12, 0);
const iso = (daysAgo: number) => new Date(NOW - daysAgo * 86_400_000).toISOString();

const session = (id: string, status: "scheduled" | "live" | "ended", endedDaysAgo = 1) => ({
  id,
  title: `Session ${id}`,
  description: "",
  stream_url: "",
  scheduled_start: iso(endedDaysAgo + 0.1),
  live_at: status === "scheduled" ? null : iso(endedDaysAgo + 0.05),
  ended_at: status === "ended" ? iso(endedDaysAgo) : null,
  status,
  showing_product_id: null,
  created_at: iso(endedDaysAgo + 1),
  updated_at: iso(endedDaysAgo),
});

const makeDb = (opts: { endedError?: boolean } = {}): SupabaseClient => {
  const sessions = [
    session("old", "ended", 70), // outside the 60-day window
    session("gone", "ended", 2), // its only piece was unpublished since
    session("keep", "ended", 5),
  ];
  const items = [
    { session_id: "gone", product_id: "px", position: 1 },
    { session_id: "keep", product_id: "p1", position: 1 },
    { session_id: "keep", product_id: "p2", position: 2 },
    { session_id: "old", product_id: "p1", position: 1 },
  ];
  const products = [
    { id: "p1", name: "Panjabi", slug: "panjabi", price: 150000, in_stock: true, status: "published", active: true },
    { id: "p2", name: "Saree", slug: "saree", price: 250000, in_stock: false, status: "published", active: true },
  ];
  const from = (table: string) => {
    const f: Record<string, unknown> = {};
    let gte: string | null = null;
    let inIds: unknown[] | null = null;
    const chain: Record<string, unknown> = {};
    const resolve = () => {
      if (table === "live_sessions") {
        if (f.status === "ended" && opts.endedError) return { data: null, error: { message: "boom" } };
        let rows = sessions.filter((s) => s.status === f.status);
        if (gte) rows = rows.filter((s) => (s.ended_at ?? "") >= gte!);
        rows = rows.sort((a, b) => (b.ended_at ?? "").localeCompare(a.ended_at ?? ""));
        return { data: rows, error: null };
      }
      if (table === "live_session_products") {
        return { data: items.filter((i) => (inIds ?? []).includes(i.session_id)), error: null };
      }
      if (table === "product_media") return { data: [], error: null };
      if (table === "products") return { data: products.filter((p) => (inIds ?? []).includes(p.id)), error: null };
      if (table === "product_variants") return { data: [], error: null };
      return { data: [], error: null };
    };
    Object.assign(chain, {
      select: () => chain,
      eq: (col: string, v: unknown) => {
        f[col] = v;
        return chain;
      },
      gte: (_col: string, v: string) => {
        gte = v;
        return chain;
      },
      in: (_col: string, ids: unknown[]) => {
        inIds = ids;
        return chain;
      },
      order: () => chain,
      limit: () => chain,
      then: (ok: (v: unknown) => unknown, err?: (e: unknown) => unknown) =>
        Promise.resolve(resolve()).then(ok, err),
    });
    return chain;
  };
  return { from } as unknown as SupabaseClient;
};

describe("getPublicLive — last live", () => {
  it("returns the newest ended session that still has published pieces, inside 60 days", async () => {
    const { getPublicLive } = await import("@/lib/db/live");
    const out = await getPublicLive(makeDb(), NOW);
    expect(out.live).toBeNull();
    expect(out.upcoming).toBeNull();
    expect(out.last?.id).toBe("keep");
    expect(out.last?.products.map((p) => p.productId)).toEqual(["p1", "p2"]);
    expect(out.last?.endedAt).toBe(NOW - 5 * 86_400_000);
  });

  it("answers live/upcoming even when the ended-list read fails", async () => {
    const { getPublicLive } = await import("@/lib/db/live");
    const out = await getPublicLive(makeDb({ endedError: true }), NOW);
    expect(out.last).toBeNull();
    expect(out.live).toBeNull();
  });
});
