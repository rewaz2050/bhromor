/**
 * Edge cache headers on the public identical-for-everyone reads (speed
 * pass, 2026-09-25): live answers carry s-maxage, unconfigured/error
 * answers stay no-store so recovery is immediate.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const flags = vi.hoisted(() => ({ service: true, supabase: true }));

vi.mock("@/lib/env", () => ({
  isServiceRoleConfigured: () => flags.service,
  isSupabaseConfigured: () => flags.supabase,
}));

vi.mock("@/lib/supabase-server", () => {
  const chainFor = (table: string) => {
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.eq = () => chain;
    chain.order = () => chain;
    chain.limit = () => chain;
    chain.single = async () => ({ data: table === "products" ? { id: "p1" } : null });
    chain.then = (ok: (v: unknown) => unknown) =>
      Promise.resolve({ data: [], error: null }).then(ok);
    return chain;
  };
  return {
    getSupabaseService: () => ({}),
    getSupabaseServer: async () => ({ from: (table: string) => chainFor(table) }),
  };
});

vi.mock("@/lib/db/engagement", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/db/engagement")>();
  const { PROMO_DEFAULTS } = await import("@/lib/promos");
  const { CAMPAIGN_DEFAULTS } = await import("@/lib/campaign");
  return {
    ...orig,
    readOpsSettings: async () => ({
      flash: PROMO_DEFAULTS.flash,
      bundle: PROMO_DEFAULTS.bundle,
      campaign: CAMPAIGN_DEFAULTS,
    }),
  };
});

vi.mock("@/lib/review-photos", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/review-photos")>();
  return { ...orig, photosForReviews: async () => ({}) };
});

import { GET as getPromo } from "../promo/route";
import { GET as getReviews } from "../reviews/route";

beforeEach(() => {
  flags.service = true;
  flags.supabase = true;
});

describe("public read edge caching", () => {
  it("caches the live promo state, never the unconfigured fallback", async () => {
    const live = await getPromo();
    expect(live.status).toBe(200);
    expect(live.headers.get("Cache-Control")).toContain("s-maxage=60");

    flags.service = false;
    const fallback = await getPromo();
    expect(fallback.headers.get("Cache-Control")).toContain("no-store");
  });

  it("caches the approved-reviews list, never the unconfigured fallback", async () => {
    const live = await getReviews(new Request("http://localhost/api/reviews?product=p1"));
    expect(live.status).toBe(200);
    expect(live.headers.get("Cache-Control")).toContain("s-maxage=60");

    flags.supabase = false;
    const fallback = await getReviews(new Request("http://localhost/api/reviews"));
    expect(fallback.headers.get("Cache-Control")).toContain("no-store");
  });
});
