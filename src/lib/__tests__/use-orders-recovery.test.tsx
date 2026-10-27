import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { AdminApiError } from "../admin-api";
import { useOrder, useOrders } from "../use-orders";

const api = vi.hoisted(() => ({ live: true, get: vi.fn(), send: vi.fn(), poll: undefined as (() => void | Promise<unknown>) | undefined }));
vi.mock("../use-staff-live", () => ({ useStaffLive: () => ({ live: api.live, checked: true }) }));
vi.mock("../admin-api", async importOriginal => ({ ...(await importOriginal<typeof import("../admin-api")>()), apiGet: api.get, apiSend: api.send }));
vi.mock("../use-poll", () => ({ usePoll: (fn: typeof api.poll) => { api.poll = fn; } }));
const page = (id: string, nextCursor: string | null = null) => ({ orders: [{ id }], nextCursor });
function deferred<T>() {
  let resolve!: (value: T) => void; let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}
beforeEach(() => { api.live = true; api.get.mockReset(); api.send.mockReset(); api.poll = undefined; });
afterEach(cleanup);

it("O01: settles initial failure, error dismissal and explicit recovery", async () => {
  api.get.mockRejectedValueOnce(new AdminApiError("Offline", 503));
  const { result } = renderHook(() => useOrders());
  await waitFor(() => expect(result.current.error).toBe("Offline"));
  expect(result.current.loading).toBe(false);
  act(() => result.current.clearError());
  expect(result.current.loading).toBe(false);
  api.get.mockResolvedValueOnce(page("RECOVERED"));
  await act(async () => { await result.current.refresh(); });
  expect(result.current.orders[0]?.id).toBe("RECOVERED");
});
it.each(["q", "shop"] as const)("O02: ignores an older %s response", async key => {
  const old = deferred<unknown>(); api.get.mockReturnValueOnce(old.promise).mockResolvedValueOnce(page("NEW"));
  const { result, rerender } = renderHook(({ value }) => useOrders({ [key]: value }), { initialProps: { value: "old" } });
  rerender({ value: "new" }); await waitFor(() => expect(result.current.orders[0]?.id).toBe("NEW"));
  await act(async () => { old.resolve(page("OLD")); });
  expect(result.current.orders[0]?.id).toBe("NEW");
});
it("does not show the previous query while the new query is pending", async () => {
  api.get.mockResolvedValueOnce(page("OLD")).mockReturnValueOnce(new Promise(() => {}));
  const { result, rerender } = renderHook(({ q }) => useOrders({ q }), { initialProps: { q: "old" } });
  await waitFor(() => expect(result.current.orders).toHaveLength(1));
  rerender({ q: "new" }); expect(result.current.orders).toEqual([]); expect(result.current.loading).toBe(true);
});
it("does not let an obsolete rejection hide a fresh result", async () => {
  const old = deferred<unknown>(); api.get.mockReturnValueOnce(old.promise).mockResolvedValueOnce(page("NEW"));
  const { result } = renderHook(() => useOrders());
  await act(async () => { await result.current.refresh(); });
  await act(async () => { old.reject(new AdminApiError("Old error", 503)); });
  expect(result.current.error).toBeNull(); expect(result.current.orders[0]?.id).toBe("NEW");
});
it("O02: never appends a previous query's older page into the new list", async () => {
  const old = deferred<unknown>(); api.get.mockResolvedValueOnce(page("OLD-1", "cursor-a")).mockReturnValueOnce(old.promise).mockResolvedValueOnce(page("NEW-1"));
  const { result, rerender } = renderHook(({ q }) => useOrders({ q }), { initialProps: { q: "old" } });
  await waitFor(() => expect(result.current.hasMore).toBe(true));
  let pending!: Promise<boolean>; act(() => { pending = result.current.loadMore(); });
  rerender({ q: "new" }); await waitFor(() => expect(result.current.orders[0]?.id).toBe("NEW-1"));
  await act(async () => { old.resolve(page("OLD-2")); await pending; });
  expect(result.current.orders.map(o => o.id)).toEqual(["NEW-1"]);
});
it("O03: clears cached rows/cursors before a new enabled session loads", async () => {
  api.get.mockResolvedValueOnce(page("A", "a-cursor")).mockReturnValueOnce(new Promise(() => {}));
  const { result, rerender } = renderHook(() => useOrders());
  await waitFor(() => expect(result.current.hasMore).toBe(true));
  api.live = false; rerender(); expect(result.current.orders).toEqual([]);
  api.live = true; rerender(); expect(result.current.orders).toEqual([]); expect(result.current.hasMore).toBe(false); expect(result.current.loading).toBe(true);
});
it("ignores a list response arriving after sign-out", async () => {
  const old = deferred<unknown>(); api.get.mockReturnValueOnce(old.promise).mockReturnValueOnce(new Promise(() => {}));
  const { result, rerender } = renderHook(() => useOrders());
  api.live = false; rerender(); await act(async () => { old.resolve(page("A")); });
  api.live = true; rerender(); expect(result.current.orders).toEqual([]); expect(result.current.loading).toBe(true);
});
it("a saved refresh callback cannot GET after sign-out", async () => {
  api.get.mockResolvedValue(page("A")); const { result, rerender } = renderHook(() => useOrders());
  await waitFor(() => expect(result.current.orders).toHaveLength(1)); const refresh = result.current.refresh;
  api.live = false; rerender(); api.get.mockClear();
  await act(async () => { await refresh(); }); expect(api.get).not.toHaveBeenCalled();
});
it("keeps verified rows and cursor when a refresh fails", async () => {
  api.get.mockResolvedValueOnce(page("GOOD", "cursor")).mockRejectedValueOnce(new AdminApiError("Offline", 503));
  const { result } = renderHook(() => useOrders()); await waitFor(() => expect(result.current.orders).toHaveLength(1));
  await act(async () => { await result.current.refresh(); });
  expect(result.current.orders[0]?.id).toBe("GOOD"); expect(result.current.hasMore).toBe(true); expect(result.current.loading).toBe(false);
});
it("deduplicates two loadMore calls before React has rerendered", async () => {
  const older = deferred<unknown>(); api.get.mockResolvedValueOnce(page("A", "cursor")).mockReturnValueOnce(older.promise);
  const { result } = renderHook(() => useOrders()); await waitFor(() => expect(result.current.hasMore).toBe(true));
  let first!: Promise<boolean>; let second!: Promise<boolean>;
  act(() => { first = result.current.loadMore(); second = result.current.loadMore(); });
  expect(api.get).toHaveBeenCalledTimes(2);
  await act(async () => { older.resolve(page("B")); await Promise.all([first, second]); });
  expect(result.current.orders.map(o => o.id)).toEqual(["A", "B"]);
});
it("a background poll does not supersede a pending older-page request", async () => {
  const older = deferred<unknown>(); api.get.mockResolvedValueOnce(page("A", "cursor")).mockReturnValueOnce(older.promise);
  const { result } = renderHook(() => useOrders()); await waitFor(() => expect(result.current.hasMore).toBe(true));
  let pending!: Promise<boolean>; act(() => { pending = result.current.loadMore(); });
  await act(async () => { await api.poll?.(); }); expect(api.get).toHaveBeenCalledTimes(2);
  await act(async () => { older.resolve(page("B")); await pending; });
  expect(result.current.orders.map(o => o.id)).toEqual(["A", "B"]);
});
it("manual refresh supersedes pagination, without the old finally clearing a new spinner", async () => {
  const old = deferred<unknown>(); const newer = deferred<unknown>();
  api.get.mockResolvedValueOnce(page("A", "c1")).mockReturnValueOnce(old.promise).mockResolvedValueOnce(page("FRESH", "c2")).mockReturnValueOnce(newer.promise);
  const { result } = renderHook(() => useOrders()); await waitFor(() => expect(result.current.hasMore).toBe(true));
  let first!: Promise<boolean>; act(() => { first = result.current.loadMore(); });
  await act(async () => { await result.current.refresh(); });
  let second!: Promise<boolean>; act(() => { second = result.current.loadMore(); });
  await act(async () => { old.resolve(page("STALE")); await first; });
  expect(result.current.loadingMore).toBe(true);
  await act(async () => { newer.resolve(page("LATEST")); await second; });
  expect(result.current.orders.map(o => o.id)).toEqual(["FRESH", "LATEST"]); expect(result.current.loadingMore).toBe(false);
});
it("a later refresh still re-walks every successfully opened page", async () => {
  api.get.mockResolvedValueOnce(page("A", "c1")).mockResolvedValueOnce(page("B"));
  const { result } = renderHook(() => useOrders()); await waitFor(() => expect(result.current.hasMore).toBe(true));
  await act(async () => { await result.current.loadMore(); });
  api.get.mockClear(); api.get.mockResolvedValueOnce(page("A2", "c1")).mockResolvedValueOnce(page("B2"));
  await act(async () => { await result.current.refresh(); });
  expect(api.get).toHaveBeenCalledTimes(2); expect(result.current.orders.map(o => o.id)).toEqual(["A2", "B2"]);
});

it.each([404, 503, 200])("O04: ignores an old detail response (%i) after a new order loaded", async status => {
  const old = deferred<unknown>(); api.get.mockImplementation((url: string) => url.includes("?") ? Promise.resolve({ orders: [] }) : url.endsWith("/A") ? old.promise : Promise.resolve({ order: { id: "B" } }));
  const { result, rerender } = renderHook(({ id }) => useOrder(id), { initialProps: { id: "A" } });
  await waitFor(() => expect(api.get).toHaveBeenCalledWith("/api/admin/orders/A"));
  rerender({ id: "B" }); await waitFor(() => expect(result.current.order?.id).toBe("B"));
  await act(async () => { if (status === 200) old.resolve({ order: { id: "A" } }); else old.reject(new AdminApiError("Old detail error", status)); });
  expect(result.current.order?.id).toBe("B"); expect(result.current.error).toBeNull();
});
it("does not carry a previous not-found flag into the next order's pending state", async () => {
  api.get.mockImplementation((url: string) => url.includes("?") ? Promise.resolve({ orders: [] }) : url.endsWith("/A") ? Promise.reject(new AdminApiError("Missing", 404)) : new Promise(() => {}));
  const { result, rerender } = renderHook(({ id }) => useOrder(id), { initialProps: { id: "A" } });
  await waitFor(() => expect(result.current.loading).toBe(false)); rerender({ id: "B" });
  expect(result.current.loading).toBe(true); expect(result.current.error).toBeNull();
});
it("clears cached detail after disabling and before a new session's list loads", async () => {
  let waiting = false;
  api.get.mockImplementation((url: string) => waiting ? new Promise(() => {}) : Promise.resolve(url.includes("?") ? { orders: [] } : { order: { id: "A" } }));
  const { result, rerender } = renderHook(() => useOrder("A")); await waitFor(() => expect(result.current.order?.id).toBe("A"));
  api.live = false; rerender(); expect(result.current.order).toBeUndefined();
  waiting = true; api.live = true; rerender(); expect(result.current.order).toBeUndefined(); expect(result.current.loading).toBe(true);
});

it("O02: ignores a late pagination rejection after changing the query", async () => {
  const oldPage = deferred<unknown>();
  api.get.mockResolvedValueOnce(page("OLD", "older")).mockReturnValueOnce(oldPage.promise).mockResolvedValueOnce(page("NEW"));
  const { result, rerender } = renderHook(({ q }) => useOrders({ q }), { initialProps: { q: "old" } });
  await waitFor(() => expect(result.current.hasMore).toBe(true));
  let pending!: Promise<boolean>;
  act(() => { pending = result.current.loadMore(); });
  rerender({ q: "new" });
  await waitFor(() => expect(result.current.orders[0]?.id).toBe("NEW"));
  await act(async () => { oldPage.reject(new AdminApiError("Old pagination failure", 503)); await pending; });
  expect(result.current.error).toBeNull();
  expect(result.current.loadingMore).toBe(false);
  expect(result.current.orders.map(order => order.id)).toEqual(["NEW"]);
});

it("O03: an old-session mutation completion does not refresh the new session", async () => {
  const mutation = deferred<unknown>();
  api.get.mockResolvedValueOnce(page("OLD")).mockResolvedValueOnce(page("NEW"));
  api.send.mockReturnValueOnce(mutation.promise);
  const { result, rerender } = renderHook(() => useOrders());
  await waitFor(() => expect(result.current.orders[0]?.id).toBe("OLD"));
  let pending!: Promise<boolean>;
  act(() => { pending = result.current.advance("OLD", "confirmed"); });
  api.live = false; rerender();
  api.live = true; rerender();
  await waitFor(() => expect(result.current.orders[0]?.id).toBe("NEW"));
  await act(async () => { mutation.resolve({ order: { id: "OLD" } }); await pending; });
  expect(api.get).toHaveBeenCalledTimes(2);
  expect(result.current.orders[0]?.id).toBe("NEW");
  expect(result.current.error).toBeNull();
});

it("O04: rejects a pending detail response across logout and re-login", async () => {
  const oldDetail = deferred<unknown>();
  let details = 0;
  api.get.mockImplementation((url: string) => url.includes("/orders/A")
    ? (++details === 1 ? oldDetail.promise : Promise.resolve({ order: { id: "A", marker: "new" } }))
    : Promise.resolve({ orders: [] }));
  const { result, rerender } = renderHook(() => useOrder("A"));
  await waitFor(() => expect(details).toBe(1));
  api.live = false; rerender();
  api.live = true; rerender();
  await waitFor(() => expect(result.current.order).toMatchObject({ marker: "new" }));
  await act(async () => { oldDetail.resolve({ order: { id: "A", marker: "old" } }); });
  expect(result.current.order).toMatchObject({ marker: "new" });
});

it("O04: a current missing order can be retried successfully", async () => {
  let missing = true;
  api.get.mockImplementation((url: string) => url.includes("/orders/A")
    ? (missing ? Promise.reject(new AdminApiError("Not found", 404)) : Promise.resolve({ order: { id: "A" } }))
    : Promise.resolve({ orders: [] }));
  const { result } = renderHook(() => useOrder("A"));
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.order).toBeUndefined();
  missing = false;
  await act(async () => { await result.current.refresh(); });
  expect(result.current.order?.id).toBe("A");
  expect(result.current.loading).toBe(false);
});

it("passes emergency intent only for an explicit shop override through the detail hook", async () => {
  api.get.mockResolvedValue(page("PS-OVERRIDE"));
  api.send.mockResolvedValue({});
  const { result } = renderHook(() => useOrder("PS-OVERRIDE"));
  await waitFor(() => expect(result.current.order?.id).toBe("PS-OVERRIDE"));
  await act(async () => { await result.current.advance("PS-OVERRIDE", "confirmed", "Verified emergency shop request", true); });
  expect(api.send).toHaveBeenLastCalledWith("/api/admin/orders/PS-OVERRIDE/advance", "POST", {
    to: "confirmed", note: "Verified emergency shop request", fulfilmentOverride: true,
  });
  await act(async () => { await result.current.advance("PS-OVERRIDE", "cancelled", "Customer requested cancellation"); });
  expect(api.send).toHaveBeenLastCalledWith("/api/admin/orders/PS-OVERRIDE/advance", "POST", {
    to: "cancelled", note: "Customer requested cancellation",
  });
});
