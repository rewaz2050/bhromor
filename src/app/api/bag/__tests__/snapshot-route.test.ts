/**
 * PUT /api/bag/snapshot (UX plan §5, R10): 204 when nothing is stored
 * (no service role, or a device without the offers opt-in), 200 when the
 * row is written, 400 on garbage, 503 naming the migration.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const state = vi.hoisted(() => ({
  configured: true,
  result: { ok: true, stored: true } as unknown,
  calls: [] as unknown[],
}));

vi.mock("@/lib/env", () => ({ isServiceRoleConfigured: () => state.configured }));
vi.mock("@/lib/supabase-server", () => ({ getSupabaseService: () => (state.configured ? {} : null) }));
vi.mock("@/lib/abandoned-bag", async () => {
  const actual = await vi.importActual<typeof import("@/lib/abandoned-bag")>("@/lib/abandoned-bag");
  return {
    BAG_SNAPSHOTS_MIGRATION: actual.BAG_SNAPSHOTS_MIGRATION,
    saveBagSnapshot: async (_db: unknown, input: unknown) => {
      state.calls.push(input);
      return state.result;
    },
  };
});

import { PUT } from "../snapshot/route";
import { __resetRateLimits } from "@/lib/rate-limit";

const put = (body: unknown) =>
  PUT(
    new Request("http://localhost/api/bag/snapshot", {
      method: "PUT",
      headers: { "content-type": "application/json", "x-forwarded-for": "10.0.0.1" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );

beforeEach(() => {
  state.configured = true;
  state.result = { ok: true, stored: true };
  state.calls.length = 0;
  __resetRateLimits();
});
afterEach(() => vi.restoreAllMocks());

describe("PUT /api/bag/snapshot", () => {
  it("writes the row and answers 200", async () => {
    const res = await put({ endpoint: "https://push.example/a", count: 2, subtotal: 125000, topName: "P", topSlug: "p", lang: "bn" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, stored: true });
    expect(state.calls[0]).toMatchObject({ endpoint: "https://push.example/a", count: 2 });
  });

  it("204 for a device without the opt-in, and without a service role", async () => {
    state.result = { ok: true, stored: false };
    expect((await put({ endpoint: "https://push.example/b", count: 1, subtotal: 1 })).status).toBe(204);
    state.configured = false;
    expect((await put({ endpoint: "https://push.example/b", count: 1, subtotal: 1 })).status).toBe(204);
  });

  it("400 on garbage or a bad endpoint, 503 naming the migration when the table is missing", async () => {
    expect((await put("{nope")).status).toBe(400);
    state.result = { ok: false, reason: "invalid" };
    expect((await put({ endpoint: "http://x", count: 1, subtotal: 1 })).status).toBe(400);
    state.result = { ok: false, reason: "missing_table" };
    const res = await put({ endpoint: "https://push.example/a", count: 1, subtotal: 1 });
    expect(res.status).toBe(503);
    expect((await res.json()).error).toContain("202609270003_bag_snapshots.sql");
  });
});
