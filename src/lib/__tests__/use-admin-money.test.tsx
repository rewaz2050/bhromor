import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { useAdminMoney } from "../use-admin-money";
const api = vi.hoisted(() => ({ live: true, get: vi.fn() }));
vi.mock("../use-staff-live", () => ({ useStaffLive: () => ({ live: api.live, checked: true }) }));
vi.mock("../admin-api", () => ({ apiGet: api.get, apiSend: vi.fn(), apiErrorMessage: (e: Error) => e.message }));
const snapshot = (baseFee: number) => ({ ready: true, summary: null, queue: null, settings: { baseFee, codHandlingFee: 0, minPayout: 100 } });
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
beforeEach(() => { api.live = true; api.get.mockReset(); });
afterEach(cleanup);
it("ends initial loading on failure and recovers with explicit refresh", async () => {
  api.get.mockRejectedValueOnce(new Error("Offline"));
  const { result } = renderHook(useAdminMoney);
  await waitFor(() => expect(result.current.error).toBe("Offline"));
  expect(result.current.loading).toBe(false);
  api.get.mockResolvedValueOnce(snapshot(30));
  await act(async () => { await result.current.refresh(); });
  expect(result.current.error).toBeNull();
  expect(result.current.settings?.baseFee).toBe(30);
});
it("does not let an older request overwrite a newer refresh", async () => {
  const old = deferred<ReturnType<typeof snapshot>>();
  api.get.mockReturnValueOnce(old.promise).mockResolvedValueOnce(snapshot(40));
  const { result } = renderHook(useAdminMoney);
  await act(async () => { await result.current.refresh(); });
  await act(async () => { old.resolve(snapshot(20)); });
  expect(result.current.settings?.baseFee).toBe(40);
});
it("does not restore financial state from an in-flight response after sign-out", async () => {
  const old = deferred<ReturnType<typeof snapshot>>(); api.get.mockReturnValueOnce(old.promise);
  const { result, rerender } = renderHook(useAdminMoney);
  api.live = false; rerender();
  await act(async () => { old.resolve(snapshot(20)); });
  expect(result.current.settings).toBeNull();
  expect(result.current.ready).toBe(false);
});
it("keeps the last verified snapshot when a refresh fails", async () => {
  api.get.mockResolvedValueOnce(snapshot(30));
  const { result } = renderHook(useAdminMoney);
  await waitFor(() => expect(result.current.settings?.baseFee).toBe(30));
  api.get.mockRejectedValueOnce(new Error("Disconnected"));
  await act(async () => { await result.current.refresh(); });
  expect(result.current.settings?.baseFee).toBe(30);
  expect(result.current.error).toBe("Disconnected");
});
it("ignores the old range response after selecting a new P&L window", async () => {
  const old = deferred<ReturnType<typeof snapshot>>();
  api.get.mockReturnValueOnce(old.promise).mockResolvedValueOnce(snapshot(60));
  const { result } = renderHook(useAdminMoney);
  act(() => result.current.setRange("7d"));
  await waitFor(() => expect(result.current.settings?.baseFee).toBe(60));
  await act(async () => { old.resolve(snapshot(20)); });
  expect(api.get).toHaveBeenLastCalledWith("/api/admin/money?range=7d");
  expect(result.current.settings?.baseFee).toBe(60);
});

it("O12: does not label the previous period's P&L with a failed new range", async () => {
  api.get.mockResolvedValueOnce({ ...snapshot(30), pnl: { commission: 3000 } });
  const { result } = renderHook(useAdminMoney);
  await waitFor(() => expect(result.current.pnl?.commission).toBe(3000));
  api.get.mockRejectedValueOnce(new Error("New range offline"));
  act(() => result.current.setRange("7d"));
  expect(result.current.pnl).toBeNull();
  await waitFor(() => expect(result.current.error).toBe("New range offline"));
  expect(result.current.range).toBe("7d"); expect(result.current.pnl).toBeNull();
  expect(result.current.loading).toBe(false);
});
it("O11: dismissal after a failed first read does not restart infinite loading", async () => {
  api.get.mockRejectedValueOnce(new Error("Offline"));
  const { result } = renderHook(useAdminMoney);
  await waitFor(() => expect(result.current.error).toBe("Offline"));
  act(() => result.current.clearError());
  expect(result.current.loading).toBe(false);
});
it("O11: only a successful ready:false response confirms missing backend", async () => {
  api.get.mockRejectedValueOnce(new Error("Offline"));
  const { result } = renderHook(useAdminMoney);
  await waitFor(() => expect(result.current.error).toBe("Offline"));
  expect(result.current.backendMissing).toBe(false);
  act(() => result.current.clearError());
  expect(result.current.backendMissing).toBe(false);
  api.get.mockResolvedValueOnce({ ...snapshot(30), ready: false });
  await act(async () => { await result.current.refresh(); });
  expect(result.current.backendMissing).toBe(true);
});
it("O12: failed period reads settle and a retry can restore current-range P&L", async () => {
  api.get.mockResolvedValueOnce({ ...snapshot(30), pnl: { commission: 3000 } });
  const { result } = renderHook(useAdminMoney);
  await waitFor(() => expect(result.current.pnl?.commission).toBe(3000));
  api.get.mockRejectedValueOnce(new Error("New range offline"));
  act(() => result.current.setRange("7d"));
  expect(result.current.pnlLoading).toBe(true);
  await waitFor(() => expect(result.current.pnlLoading).toBe(false));
  act(() => result.current.clearError());
  expect(result.current.pnlLoading).toBe(false); expect(result.current.pnl).toBeNull();
  api.get.mockResolvedValueOnce({ ...snapshot(30), pnl: { commission: 700 } });
  await act(async () => { await result.current.refresh(); });
  expect(result.current.pnl?.commission).toBe(700); expect(result.current.range).toBe("7d");
});
