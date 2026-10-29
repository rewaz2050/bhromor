import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { useRiderEarnings } from "../use-rider-money";
const api = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("../use-rider", () => ({ riderFetch: api.fetch }));
const snapshot = { ready: true, summary: null, entries: [], payouts: [] };
function deferred() { let resolve!: (value: typeof snapshot) => void; const promise = new Promise<typeof snapshot>(r => { resolve = r; }); return { promise, resolve }; }
beforeEach(() => { api.fetch.mockReset(); });
afterEach(cleanup);
it("discards a pending earnings response after the session is disabled", async () => {
  const old = deferred(); api.fetch.mockReturnValueOnce(old.promise);
  const { result, rerender } = renderHook(({ enabled }) => useRiderEarnings(enabled), { initialProps: { enabled: true } });
  rerender({ enabled: false });
  await act(async () => { old.resolve(snapshot); });
  expect(result.current.ready).toBe(false);
  expect(result.current.loading).toBe(false);
});
it("does not restore a prior session's snapshot while a new session loads", async () => {
  api.fetch.mockResolvedValueOnce(snapshot).mockReturnValueOnce(new Promise(() => {}));
  const { result, rerender } = renderHook(({ enabled }) => useRiderEarnings(enabled), { initialProps: { enabled: true } });
  await waitFor(() => expect(result.current.ready).toBe(true));
  rerender({ enabled: false }); rerender({ enabled: true });
  expect(result.current.ready).toBe(false);
});
it("ends loading on failure and recovers on refresh", async () => {
  api.fetch.mockRejectedValueOnce(new Error("Offline"));
  const { result } = renderHook(() => useRiderEarnings(true));
  await waitFor(() => expect(result.current.error).toBe("Offline"));
  expect(result.current.loading).toBe(false);
  api.fetch.mockResolvedValueOnce(snapshot);
  await act(async () => { await result.current.refresh(); });
  expect(result.current.ready).toBe(true);
  expect(result.current.error).toBeNull();
});
