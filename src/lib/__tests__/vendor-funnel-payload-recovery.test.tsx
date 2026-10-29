import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { useVendorFunnel } from "../use-vendor";
import { emptyShopFunnel } from "../shop-funnel";

vi.mock("../supabase-browser", () => ({ getSupabaseBrowser: () => null }));
const request = vi.fn();
const valid = {
  ...emptyShopFunnel(7),
  shopId: "shop-a",
  sessions: 70,
  pageViews: 90,
  orders: 3,
  revenue: 75000,
  aov: 25000,
};
const reply = (body: unknown) => ({
  ok: true,
  status: 200,
  json: async () => body,
});
beforeEach(() => {
  request.mockReset();
  vi.stubGlobal("fetch", request);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it.each([
  null,
  {},
  { sessions: 70 },
  { ...valid, topProducts: null },
  { ...valid, revenue: "75000" },
  { ...valid, atcBySource: [null] },
  { ...valid, aov: NaN },
  { ...valid, days: 28 },
  {
    ...valid,
    topProducts: [{ productId: "p1", name: {}, views: 2, adds: 1, orders: 0 }],
  },
  {
    ...valid,
    topProducts: [
      { productId: "p1", name: "Product", views: Infinity, adds: 1, orders: 0 },
    ],
  },
])(
  "invalid or wrong-period vendor payload does not become verified analytics: %j",
  async (body) => {
    request.mockResolvedValueOnce(reply(body));
    const { result } = renderHook(() => useVendorFunnel(true));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.funnel).toBeNull();
    expect(result.current.error).toBe(
      "The funnel response could not be validated. Try again.",
    );
    expect(result.current.missing).toBe(false);
  },
);
it("invalid vendor payload can be retried without changing valid financial data", async () => {
  request.mockResolvedValueOnce(reply({})).mockResolvedValueOnce(reply(valid));
  const { result } = renderHook(() => useVendorFunnel(true));
  await waitFor(() => expect(result.current.error).not.toBeNull());
  await act(async () => {
    result.current.refresh();
  });
  await waitFor(() => expect(result.current.funnel).toEqual(valid));
  expect(result.current.error).toBeNull();
});
it("accepts a complete zero-count vendor report with nullable shop and AOV", async () => {
  const empty = emptyShopFunnel(7);
  request.mockResolvedValueOnce(reply(empty));
  const { result } = renderHook(() => useVendorFunnel(true));
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.funnel).toEqual(empty);
  expect(result.current.error).toBeNull();
});
