import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { useRiders } from "../use-riders";
const api = vi.hoisted(() => ({ live: true, get: vi.fn() }));
vi.mock("../use-staff-live", () => ({ useStaffLive: () => ({ live: api.live, checked: true }) }));
vi.mock("../admin-api", () => ({ apiGet: api.get, apiSend: vi.fn(), apiErrorMessage: (e: Error) => e.message }));
vi.mock("../use-poll", () => ({ usePoll: vi.fn() }));
const snapshot = (id: string) => ({ riders: [{ id }], settleClaims: [], dispatch: { cashCap: 500000, offerTtl: 90, maxAttempts: 2, loadLimit: 2, failedFee: 0 } });
function deferred() { let resolve!: (value: ReturnType<typeof snapshot>) => void; let reject!: (error: Error) => void; const promise = new Promise<ReturnType<typeof snapshot>>((res, rej) => { resolve = res; reject = rej; }); return { promise, resolve, reject }; }
beforeEach(() => { api.live = true; api.get.mockReset(); });
afterEach(cleanup);
it("ends initial loading after failure and can recover explicitly", async () => {
  api.get.mockRejectedValueOnce(new Error("Offline"));
  const { result } = renderHook(() => useRiders());
  await waitFor(() => expect(result.current.error).toBe("Offline"));
  expect(result.current.loading).toBe(false);
  api.get.mockResolvedValueOnce(snapshot("recovered"));
  await act(async () => { await result.current.reset(); });
  expect(result.current.riders[0]?.id).toBe("recovered");
  expect(result.current.error).toBeNull();
});
it("does not let an older result replace a newer snapshot", async () => {
  const old = deferred(); api.get.mockReturnValueOnce(old.promise).mockResolvedValueOnce(snapshot("new"));
  const { result } = renderHook(() => useRiders());
  await act(async () => { await result.current.reset(); });
  await act(async () => { old.resolve(snapshot("old")); });
  expect(result.current.riders[0]?.id).toBe("new");
});
it("does not let an older rejection hide a successful refresh", async () => {
  const old = deferred(); api.get.mockReturnValueOnce(old.promise).mockResolvedValueOnce(snapshot("new"));
  const { result } = renderHook(() => useRiders());
  await act(async () => { await result.current.reset(); });
  await act(async () => { old.reject(new Error("Old failure")); });
  expect(result.current.error).toBeNull();
});
it("discards a pending response after sign-out", async () => {
  const old = deferred(); api.get.mockReturnValueOnce(old.promise);
  const { result, rerender } = renderHook(() => useRiders());
  api.live = false; rerender();
  await act(async () => { old.resolve(snapshot("signed-out")); });
  expect(result.current.riders).toEqual([]);
  expect(result.current.loading).toBe(false);
});
it("does not request data while signed out, even using a saved refresh callback", async () => {
  api.get.mockResolvedValue(snapshot("initial"));
  const { result, rerender } = renderHook(() => useRiders());
  await waitFor(() => expect(result.current.riders).toHaveLength(1));
  const refresh = result.current.reset;
  api.live = false; rerender(); api.get.mockClear();
  await act(async () => { await refresh(); });
  expect(api.get).not.toHaveBeenCalled();
  expect(result.current.riders).toEqual([]);
});
it("retains the last good rows on a transient refresh failure", async () => {
  api.get.mockResolvedValueOnce(snapshot("verified"));
  const { result } = renderHook(() => useRiders());
  await waitFor(() => expect(result.current.riders).toHaveLength(1));
  api.get.mockRejectedValueOnce(new Error("Disconnected"));
  await act(async () => { await result.current.reset(); });
  expect(result.current.riders[0]?.id).toBe("verified");
  expect(result.current.error).toBe("Disconnected");
});

it("does not restart the loading skeleton when an initial error is dismissed", async () => {
  api.get.mockRejectedValueOnce(new Error("Offline"));
  const { result } = renderHook(() => useRiders());
  await waitFor(() => expect(result.current.error).toBe("Offline"));
  act(() => result.current.clearError());
  expect(result.current.loading).toBe(false);
});
