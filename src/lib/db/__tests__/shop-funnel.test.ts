/**
 * B4 (2026-09-28) — the per-shop funnel read.
 *
 * The shop id must come from the verified session, and the two failure modes
 * must stay different: "the migration is not installed" (say so) versus "the
 * shop genuinely had a quiet week" (show it, do not pretend it is an error).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("server-only", () => ({}));

const state = vi.hoisted(() => ({
  // Loose on purpose: only `rpc` is ever called, and the service client is
  // typed as a Supabase client by the module under test.
  service: null as unknown,
  calls: [] as { name: string; args: Record<string, unknown> }[],
}));
vi.mock("../../supabase-server", () => ({
  getSupabaseService: () => state.service,
}));

const { ShopFunnelMissingError, shopFunnelFor, shopFunnelReport } = await import("../vendor-funnel");

const db = (answer: unknown): SupabaseClient =>
  ({
    rpc: async (name: string, args: Record<string, unknown>) => {
      state.calls.push({ name, args });
      const res = typeof answer === "function" ? answer(name, args) : answer;
      if (res && typeof res === "object" && "error" in (res as object)) return res;
      return { data: res, error: null };
    },
  }) as unknown as SupabaseClient;

const reportRow = {
  days: 7,
  shop_id: "s1",
  sessions: 120,
  page_views: 240,
  pdp_sessions: 60,
  atc_sessions: 20,
  checkout_sessions: 10,
  purchase_sessions: 8,
  orders: 9,
  revenue: 1_200_000,
  aov: 133_333,
  units: 12,
  atc_by_source: [{ source: "pdp", count: 20 }],
  top_products: [{ product_id: "p1", name: "Saree", views: 40, adds: 12, orders: 6 }],
};

beforeEach(() => {
  state.calls = [];
  state.service = db(reportRow);
});

describe("shopFunnelReport", () => {
  it("calls ps_shop_funnel_report with the shop it was given", async () => {
    const report = await shopFunnelReport(db(reportRow), "s1", 7);
    expect(state.calls[0]).toEqual({
      name: "ps_shop_funnel_report",
      args: { p_shop_id: "s1", p_days: 7 },
    });
    expect(report.sessions).toBe(120);
    expect(report.addToCartSessions).toBe(20);
    expect(report.aov).toBe(133_333);
    expect(report.topProducts[0].name).toBe("Saree");
  });

  it("treats a missing function as 'not installed', by code and by message", async () => {
    for (const err of [
      { code: "PGRST202", message: "Could not find the function" },
      { code: "42883", message: "function public.ps_shop_funnel_report(text, integer) does not exist" },
      { code: "42P01", message: "relation storefront_events does not exist" },
      { code: "", message: "could not find the function ps_shop_funnel_report" },
    ]) {
      await expect(shopFunnelReport(db({ data: null, error: err }), "s1", 7)).rejects.toBeInstanceOf(
        ShopFunnelMissingError,
      );
    }
  });

  it("lets a real failure surface (not swallowed as 'not installed')", async () => {
    await expect(
      shopFunnelReport(db({ data: null, error: { code: "57014", message: "statement timeout" } }), "s1", 7),
    ).rejects.toThrow(/statement timeout/);
  });

  it("refuses to run without a shop id — no shop means no numbers", async () => {
    await expect(shopFunnelReport(db(reportRow), "", 7)).rejects.toBeInstanceOf(ShopFunnelMissingError);
    expect(state.calls).toEqual([]);
  });
});

describe("shopFunnelFor", () => {
  it("reads the session's own shop through the service client", async () => {
    const { report, missing } = await shopFunnelFor("s1", 28);
    expect(missing).toBe(false);
    expect(report?.sessions).toBe(120);
    expect(state.calls[0].args).toEqual({ p_shop_id: "s1", p_days: 28 });
  });

  it("reports 'missing' when the migration is not installed", async () => {
    state.service = db({ data: null, error: { code: "42883", message: "function does not exist" } });
    const res = await shopFunnelFor("s1", 7);
    expect(res.missing).toBe(true);
    expect(res.report).toBeNull();
  });

  it("reports 'missing' when the service role is unconfigured", async () => {
    state.service = null;
    expect(await shopFunnelFor("s1", 7)).toEqual({ report: null, missing: true });
  });

  it("shows an empty week as an empty week, not as an error", async () => {
    state.service = db({ data: null, error: { code: "57014", message: "statement timeout" } });
    const res = await shopFunnelFor("s1", 7);
    expect(res.missing).toBe(false);
    expect(res.report?.sessions).toBe(0);
  });

  it("never reads anything for a shop it was not given", async () => {
    await shopFunnelFor("", 7);
    expect(state.calls).toEqual([]);
  });
});
