import { beforeEach, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
vi.mock("server-only", () => ({}));
import { funnelReport, FunnelReportMissingError } from "../reports";
const rpc = vi.fn();
const db = { rpc } as unknown as SupabaseClient;
const raw = {
  days: 7,
  sessions: 100,
  page_views: 200,
  bounced_sessions: 25,
  pdp_sessions: 60,
  atc_sessions: 30,
  checkout_sessions: 20,
  purchase_sessions: 10,
  orders: 12,
  aov: 125000,
  customers: 10,
  repeat_customers: 2,
  atc_by_source: [{ source: "pdp", count: 30 }],
  top_searches: [{ query: "saree", count: 4, max_results: 0 }],
  home_sessions: 40,
  home_scroll: [{ depth: 50, sessions: 20 }],
};
beforeEach(() => {
  rpc.mockReset();
});
async function reject(data: unknown) {
  rpc.mockResolvedValue({ data, error: null });
  await expect(funnelReport(db, 7)).rejects.toThrow(
    "Invalid funnel RPC response.",
  );
}
it.each([
  null,
  undefined,
  {},
  [],
  [raw],
  "bad",
  { sessions: 0 },
  { error: "private" },
])("rejects malformed successful raw body %j", async (data) => reject(data));
it.each([
  "sessions",
  "page_views",
  "bounced_sessions",
  "pdp_sessions",
  "atc_sessions",
  "checkout_sessions",
  "purchase_sessions",
  "orders",
  "customers",
  "repeat_customers",
  "home_sessions",
])("does not coerce required metric %s", async (key) => {
  for (const value of [undefined, null, "0", false, NaN, Infinity])
    await reject({ ...raw, [key]: value });
});
it("requires explicit nullable finite AOV", async () => {
  for (const aov of [undefined, "0", false, NaN, Infinity])
    await reject({ ...raw, aov });
});
it.each([undefined, "7", 28, 0])(
  "rejects missing/invalid/wrong-window days %s",
  async (days) => reject({ ...raw, days }),
);
it.each(["atc_by_source", "top_searches", "home_scroll"])(
  "rejects invalid raw collection %s",
  async (key) => {
    for (const value of [undefined, null, {}, [null], [[]]])
      await reject({ ...raw, [key]: value });
  },
);
it("requires source labels and finite counts", async () => {
  for (const row of [
    { source: 1, count: 2 },
    { source: "pdp", count: "2" },
    { source: "pdp" },
  ])
    await reject({ ...raw, atc_by_source: [row] });
});
it("requires raw search query/count/max_results before parser conversion", async () => {
  for (const row of [
    { query: null, count: 1, max_results: 0 },
    { query: "saree", count: "1", max_results: 0 },
    { query: "saree", count: 1 },
    { query: "saree", count: 1, max_results: Infinity },
  ])
    await reject({ ...raw, top_searches: [row] });
});
it("requires raw scroll depth and session counts", async () => {
  for (const row of [
    { depth: "50", sessions: 1 },
    { depth: 50, sessions: null },
    { depth: 50 },
  ])
    await reject({ ...raw, home_scroll: [row] });
});
it.each([7, 28] as const)(
  "preserves full %i-day report and existing calculations",
  async (days) => {
    rpc.mockResolvedValue({ data: { ...raw, days, extra: true }, error: null });
    expect(await funnelReport(db, days)).toMatchObject({
      days,
      sessions: 100,
      bounceRate: 0.25,
      pagesPerSession: 2,
      aov: 125000,
      repeatRate: 0.2,
      atcBySource: [{ source: "pdp", count: 30 }],
      topSearches: [{ query: "saree", count: 4, zeroResults: true }],
      homeScroll: [{ depth: 50, share: 0.5 }],
    });
    expect(rpc).toHaveBeenCalledWith("ps_funnel_report", { p_days: days });
  },
);
it("preserves genuine zero/null-AOV SQL output", async () => {
  const data = {
    ...raw,
    sessions: 0,
    page_views: 0,
    bounced_sessions: 0,
    pdp_sessions: 0,
    atc_sessions: 0,
    checkout_sessions: 0,
    purchase_sessions: 0,
    orders: 0,
    aov: null,
    customers: 0,
    repeat_customers: 0,
    home_sessions: 0,
    atc_by_source: [],
    top_searches: [],
    home_scroll: [],
  };
  rpc.mockResolvedValue({ data, error: null });
  expect(await funnelReport(db, 7)).toMatchObject({
    sessions: 0,
    aov: 0,
    bounceRate: 0,
    pagesPerSession: 0,
    repeatRate: 0,
  });
});
it("does not override explicit non-schema codes with misleading diagnostic text", async () => {
  rpc.mockResolvedValue({
    data: null,
    error: {
      code: "57014",
      message:
        "function public.ps_funnel_report does not exist in timeout diagnostic",
    },
  });
  await expect(funnelReport(db, 7)).rejects.not.toBeInstanceOf(
    FunnelReportMissingError,
  );
});
