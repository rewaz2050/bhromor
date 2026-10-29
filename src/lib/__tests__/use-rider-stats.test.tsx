import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { useRiderStats } from "../use-rider";
vi.mock("../supabase-browser", () => ({ getSupabaseBrowser: () => null }));
const valid = { totalDeliveries: 12, weekDeliveries: 3, ratingAvg: 4.5, ratingCount: 2 };
const fetchMock = vi.fn();
beforeEach(() => { vi.stubGlobal("fetch", fetchMock); fetchMock.mockReset(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const respond = (data: unknown) => fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => data });
it.each([{}, { stats: null }, { stats: { ratingCount: 2 } }, { stats: { ...valid, ratingAvg: "4.5" } }])("keeps unavailable stats null for an invalid response: %j", async data => {
  respond(data);
  const { result } = renderHook(() => useRiderStats(true));
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.stats).toBeNull();
});
it("retains last verified stats after a malformed refresh", async () => {
  respond({ stats: valid });
  const { result } = renderHook(() => useRiderStats(true));
  await waitFor(() => expect(result.current.stats).toEqual(valid));
  respond({});
  await act(async () => result.current.refresh());
  expect(result.current.stats).toEqual(valid);
});
