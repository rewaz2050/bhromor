import { beforeEach, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("../../supabase-server", () => ({
  getSupabaseService: () => ({ rpc: state.rpc }),
}));
import { shopFunnelFor, shopFunnelReport } from "../vendor-funnel";

const valid = {
  days: 7,
  shop_id: "s1",
  sessions: 120,
  page_views: 240,
  pdp_sessions: 60,
  atc_sessions: 20,
  checkout_sessions: 10,
  purchase_sessions: 8,
  orders: 9,
  revenue: 1200000,
  aov: 133333,
  units: 12,
  atc_by_source: [{ source: "pdp", count: 20 }],
  top_products: [
    {
      product_id: "p1",
      name: "Saree",
      slug: null,
      views: 40,
      adds: 12,
      orders: 6,
    },
  ],
};
const db = { rpc: state.rpc } as unknown as SupabaseClient;
beforeEach(() => state.rpc.mockReset());
async function rejected(raw: unknown) {
  state.rpc.mockResolvedValue({ data: raw, error: null });
  await expect(shopFunnelReport(db, "s1", 7)).rejects.toThrow(
    "Invalid shop funnel RPC response.",
  );
  expect(await shopFunnelFor("s1", 7)).toEqual({
    report: null,
    missing: false,
  });
}
it.each([
  ["null", null],
  ["undefined", undefined],
  ["empty object", {}],
  ["array envelope", [valid]],
  ["primitive", "bad"],
  ["partial", { sessions: 0 }],
  ["error envelope", { error: "Private diagnostic" }],
] as const)("rejects successful malformed RPC body: %s", async (_label, raw) =>
  rejected(raw),
);
it.each([
  "sessions",
  "page_views",
  "pdp_sessions",
  "atc_sessions",
  "checkout_sessions",
  "purchase_sessions",
  "orders",
  "revenue",
  "units",
])("never manufactures metric %s", async (key) => {
  for (const value of [undefined, null, "0", false, NaN, Infinity])
    await rejected({ ...valid, [key]: value });
});
it("requires explicit nullable finite AOV", async () => {
  for (const aov of [undefined, "0", false, NaN, Infinity])
    await rejected({ ...valid, aov });
});
it.each([undefined, 28, "7", 0])(
  "rejects missing/invalid/wrong-window days: %s",
  async (days) => rejected({ ...valid, days }),
);
it.each([undefined, null, "other-shop", ""])(
  "rejects missing/wrong-shop echo: %s",
  async (shop_id) => rejected({ ...valid, shop_id }),
);
it.each(["atc_by_source", "top_products"])(
  "requires an explicit valid collection: %s",
  async (key) => {
    for (const value of [undefined, null, {}, [null], [[]]])
      await rejected({ ...valid, [key]: value });
  },
);
it("rejects invalid source rows before parser coercion", async () => {
  for (const value of [
    { count: 0 },
    { source: false, count: 0 },
    { source: "pdp", count: "0" },
    { source: "pdp", count: Infinity },
  ])
    await rejected({ ...valid, atc_by_source: [value] });
});
it("rejects invalid product identity, labels, slug and metrics before parser coercion", async () => {
  const product = valid.top_products[0];
  for (const patch of [
    { product_id: undefined },
    { name: null },
    { slug: 123 },
    { views: "0" },
    { adds: undefined },
    { orders: Infinity },
  ])
    await rejected({ ...valid, top_products: [{ ...product, ...patch }] });
});
it.each([7, 28] as const)(
  "preserves valid %i-day nonempty metrics and SQL nullable slug",
  async (days) => {
    state.rpc.mockResolvedValue({ data: { ...valid, days }, error: null });
    const report = await shopFunnelReport(db, "s1", days);
    expect(report).toMatchObject({
      days,
      shopId: "s1",
      sessions: 120,
      pageViews: 240,
      orders: 9,
      revenue: 1200000,
      aov: 133333,
      topProducts: [
        { productId: "p1", name: "Saree", views: 40, adds: 12, orders: 6 },
      ],
    });
    expect(report.topProducts[0].slug).toBeUndefined();
  },
);
it("preserves complete successful zero report and nullable AOV", async () => {
  const raw = {
    ...valid,
    sessions: 0,
    page_views: 0,
    pdp_sessions: 0,
    atc_sessions: 0,
    checkout_sessions: 0,
    purchase_sessions: 0,
    orders: 0,
    revenue: 0,
    units: 0,
    aov: null,
    top_products: [],
    atc_by_source: [],
  };
  state.rpc.mockResolvedValue({ data: raw, error: null });
  expect(await shopFunnelFor("s1", 7)).toMatchObject({
    missing: false,
    report: { sessions: 0, orders: 0, aov: null, shopId: "s1" },
  });
});
it("preserves optional/string product slug compatibility and ignores extra fields", async () => {
  for (const slug of [undefined, "saree", ""]) {
    state.rpc.mockResolvedValue({
      data: {
        ...valid,
        extra: true,
        top_products: [{ ...valid.top_products[0], slug }],
      },
      error: null,
    });
    const report = await shopFunnelReport(db, "s1", 7);
    expect(report.topProducts[0].slug).toBe(slug || undefined);
  }
});
