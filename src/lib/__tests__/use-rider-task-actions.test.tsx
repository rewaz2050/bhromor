import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useRiderTaskActions, type RiderTaskAction } from "../use-rider-task-actions";
function deferred() {
  let resolve!: (value: boolean) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<boolean>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
afterEach(cleanup);
it.each<RiderTaskAction>(["accept", "reject", "pickup"])("%s completion after owner unmount does not publish", async action => {
  const pending = deferred(), publish = vi.fn(); const { result, unmount } = renderHook(() => useRiderTaskActions("r1"));
  act(() => { void result.current.run("a", action, () => pending.promise, publish); }); unmount();
  await act(async () => { pending.resolve(true); }); expect(publish).not.toHaveBeenCalled();
});
it("preserves global accept non-overlap even across different assignments", async () => {
  const pending = deferred(), first = vi.fn(() => pending.promise), second = vi.fn(async () => true), publish = vi.fn();
  const { result } = renderHook(() => useRiderTaskActions("r1"));
  act(() => { void result.current.run("a", "accept", first, publish); void result.current.run("b", "accept", second, publish); });
  expect(first).toHaveBeenCalledOnce(); expect(second).not.toHaveBeenCalled(); expect(result.current.accepting).toBe("a");
  await act(async () => { pending.resolve(false); }); expect(publish).toHaveBeenCalledExactlyOnceWith(false, false); expect(result.current.accepting).toBeNull();
});
it("different assignments keep independent locks; A completion cannot unlock B", async () => {
  const a = deferred(), b = deferred(), publish = vi.fn(); const { result } = renderHook(() => useRiderTaskActions("r1"));
  act(() => { void result.current.run("a", "reject", () => a.promise, publish); void result.current.run("b", "pickup", () => b.promise, publish); });
  expect(result.current.pending.size).toBe(2); await act(async () => { a.resolve(true); }); expect(result.current.pending.has("a")).toBe(false); expect(result.current.pending.get("b")).toBe("pickup");
  await act(async () => { b.resolve(true); }); expect(result.current.pending.size).toBe(0); expect(publish).toHaveBeenCalledTimes(2);
});
it("synchronous same-assignment mixed callbacks cannot bypass the ref lock", async () => {
  const pending = deferred(), other = vi.fn(async () => true), publish = vi.fn(); const { result } = renderHook(() => useRiderTaskActions("r1"));
  act(() => { void result.current.run("a", "accept", () => pending.promise, publish); void result.current.run("a", "reject", other, publish); void result.current.run("a", "pickup", other, publish); });
  expect(other).not.toHaveBeenCalled(); await act(async () => { pending.resolve(true); }); expect(publish).toHaveBeenCalledOnce();
});
it("disabled scope and its previously captured run callback cannot start a request", async () => {
  const work = vi.fn(async () => true), publish = vi.fn(); const { result, rerender } = renderHook(({ key }: { key: string | null }) => useRiderTaskActions(key), { initialProps: { key: "r1" as string | null } });
  const staleRun = result.current.run; rerender({ key: null }); await act(async () => { await staleRun("a", "accept", work, publish); await result.current.run("a", "pickup", work, publish); }); expect(work).not.toHaveBeenCalled(); expect(publish).not.toHaveBeenCalled();
});
it("unexpected rejection after unmount is consumed without a callback", async () => {
  const pending = deferred(), publish = vi.fn(); const { result, unmount } = renderHook(() => useRiderTaskActions("r1"));
  act(() => { void result.current.run("a", "pickup", () => pending.promise, publish); }); unmount(); await act(async () => { pending.reject(new Error("private detail")); }); expect(publish).not.toHaveBeenCalled();
});
