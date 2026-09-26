/**
 * POST /api/events — the funnel sink's door (UX plan §0).
 *
 * A beacon has nobody to show an error to, so the contract is: accept a
 * clean batch and insert it; answer 204 to anything the shop can't use
 * (no service role, insert failure) and a short 4xx to garbage; and rate
 * limit per IP so nobody can fill the table from a loop.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { __resetRateLimits } from "@/lib/rate-limit";

const state = vi.hoisted(() => ({
  serviceReady: true,
  inserted: [] as unknown[][],
  failInsert: false,
}));

vi.mock("@/lib/supabase-server", () => ({
  getSupabaseService: () =>
    state.serviceReady
      ? {
          from: (table: string) => ({
            insert: async (rows: unknown[]) => {
              if (state.failInsert) throw new Error("boom");
              state.inserted.push([table, ...rows]);
              return { error: null };
            },
          }),
        }
      : null,
}));

import { POST } from "@/app/api/events/route";

const post = (body: unknown, ip = "1.2.3.4") =>
  POST(
    new Request("http://x/api/events", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": ip },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );

const batch = {
  sid: "abcdef0123456789",
  events: [
    { t: "page_view", p: "/?utm=x", lang: "bn" },
    { t: "add_to_cart", pid: "p1", shop: "s1", src: "card", v: 189000 },
    { t: "nonsense" },
  ],
};

beforeEach(() => {
  state.serviceReady = true;
  state.inserted = [];
  state.failInsert = false;
  __resetRateLimits();
});

describe("POST /api/events", () => {
  it("inserts the sanitized rows and answers 204", async () => {
    const res = await post(batch);
    expect(res.status).toBe(204);
    expect(state.inserted).toHaveLength(1);
    const [table, ...rows] = state.inserted[0] as [string, ...Record<string, unknown>[]];
    expect(table).toBe("storefront_events");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ session_id: "abcdef0123456789", event: "page_view", path: "/", lang: "bn" });
    expect(rows[1]).toMatchObject({
      event: "add_to_cart",
      product_id: "p1",
      shop_id: "s1",
      source: "card",
      value: 189000,
      meta: {},
      lang: null,
    });
  });

  it("rejects garbage with a short 4xx and no insert", async () => {
    expect((await post("{not json")).status).toBe(400);
    expect((await post({ sid: "x", events: [{ t: "page_view" }] })).status).toBe(400);
    expect((await post({ sid: "abcdef0123456789", events: [{ t: "hack" }] })).status).toBe(400);
    expect(state.inserted).toHaveLength(0);
  });

  it("stays quiet (204) when the backend is unconfigured or the insert fails", async () => {
    state.serviceReady = false;
    expect((await post(batch)).status).toBe(204);
    state.serviceReady = true;
    state.failInsert = true;
    expect((await post(batch)).status).toBe(204);
    expect(state.inserted).toHaveLength(0);
  });

  it("rate limits per IP (60 batches a minute)", async () => {
    for (let i = 0; i < 60; i += 1) expect((await post(batch, "9.9.9.9")).status).toBe(204);
    expect((await post(batch, "9.9.9.9")).status).toBe(429);
    expect((await post(batch, "8.8.8.8")).status).toBe(204);
  });
});
