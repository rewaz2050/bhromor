import { expect, it } from "vitest";
import { EMPTY_FUNNEL } from "../funnel-events";
import { emptyShopFunnel } from "../shop-funnel";
import { isFunnelReport, isShopFunnel } from "../funnel-report-validation";

it("accepts complete admin data without altering values or arrays", () => {
  const data = {
    ...EMPTY_FUNNEL,
    sessions: 77,
    bounceRate: 0.35,
    pagesPerSession: 2.75,
    atcBySource: [{ source: "pdp", count: 12 }],
    topSearches: [{ query: "shirt", count: 3, zeroResults: true }],
    homeScroll: [{ depth: 75, share: 0.25 }],
  };
  const before = structuredClone(data);
  expect(isFunnelReport(data, 7)).toBe(true);
  expect(data).toEqual(before);
});
it("accepts complete vendor data with nullable fields and optional product slug", () => {
  const data = {
    ...emptyShopFunnel(28),
    revenue: 12345,
    aov: null,
    topProducts: [
      { productId: "p1", name: "Shirt", views: 10, adds: 2, orders: 1 },
    ],
    atcBySource: [{ source: "card", count: 2 }],
  };
  const before = structuredClone(data);
  expect(isShopFunnel(data, 28)).toBe(true);
  expect(data).toEqual(before);
});
it("rejects nonnumeric/nonfinite required metrics, never coerces strings to zero", () => {
  const vendor = emptyShopFunnel(7);
  for (const [data, guard] of [
    [EMPTY_FUNNEL, isFunnelReport],
    [vendor, isShopFunnel],
  ] as const) {
    for (const [key, value] of Object.entries(data)) {
      if (typeof value !== "number") continue;
      for (const bad of [undefined, "0", NaN, Infinity, {}]) {
        expect(guard({ ...data, [key]: bad }, 7), `${key}=${String(bad)}`).toBe(
          false,
        );
      }
    }
  }
});
it("rejects admin nested rows that would break rendering or misstate search metadata", () => {
  const patches = [
    { atcBySource: [null] },
    { atcBySource: [{ source: {}, count: 1 }] },
    { topSearches: [{ query: "q", count: 2, zeroResults: "false" }] },
    { topSearches: [{ query: "q", count: NaN, zeroResults: false }] },
    { homeScroll: [{ depth: 50, share: "0.5" }] },
    { homeScroll: null },
  ];
  for (const patch of patches)
    expect(isFunnelReport({ ...EMPTY_FUNNEL, ...patch }, 7)).toBe(false);
});
it("rejects invalid vendor identity, nullable metrics and product/source rows", () => {
  const data = emptyShopFunnel(7);
  const patches = [
    { shopId: {} },
    { aov: "100" },
    { atcBySource: null },
    { topProducts: [null] },
    {
      topProducts: [
        { productId: "p", name: "P", views: 1, adds: 1, orders: 1, slug: {} },
      ],
    },
    {
      topProducts: [
        { productId: "p", name: "P", views: 1, adds: 1, orders: "1" },
      ],
    },
  ];
  for (const patch of patches)
    expect(isShopFunnel({ ...data, ...patch }, 7)).toBe(false);
});
it("requires a complete record matching the selected window", () => {
  for (const value of [null, undefined, [], "report", {}, { days: 7 }]) {
    expect(isFunnelReport(value, 7)).toBe(false);
    expect(isShopFunnel(value, 7)).toBe(false);
  }
  expect(isFunnelReport(EMPTY_FUNNEL, 28)).toBe(false);
  expect(isShopFunnel(emptyShopFunnel(7), 28)).toBe(false);
});
