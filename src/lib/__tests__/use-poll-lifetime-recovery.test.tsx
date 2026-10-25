import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { usePoll } from "../use-poll";
vi.mock("../logger", () => ({ logError: vi.fn() }));
const deferred = () => {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
beforeEach(() => {
  vi.useFakeTimers();
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: "visible",
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
it("a pending disabled lifetime does not suppress polling after re-enable", () => {
  const old = deferred();
  const first = vi.fn(() => old.promise);
  const next = vi.fn(() => Promise.resolve());
  const { rerender } = renderHook(
    ({ enabled, fn }) => usePoll(fn, 1000, enabled),
    { initialProps: { enabled: true, fn: first } },
  );
  act(() => vi.advanceTimersByTime(1000));
  rerender({ enabled: false, fn: first });
  rerender({ enabled: true, fn: next });
  act(() => vi.advanceTimersByTime(1000));
  expect(first).toHaveBeenCalledOnce();
  expect(next).toHaveBeenCalledOnce();
});
it("an interval replacement has its own pending lock", () => {
  const old = deferred();
  const fn = vi
    .fn()
    .mockReturnValueOnce(old.promise)
    .mockResolvedValue(undefined);
  const { rerender } = renderHook(({ interval }) => usePoll(fn, interval), {
    initialProps: { interval: 1000 },
  });
  act(() => vi.advanceTimersByTime(1000));
  rerender({ interval: 2000 });
  act(() => vi.advanceTimersByTime(2000));
  expect(fn).toHaveBeenCalledTimes(2);
});
it.each(["resolve", "reject"] as const)(
  "old %s cannot unlock a newer lifetime's unfinished poll",
  async (outcome) => {
    const old = deferred();
    const current = deferred();
    const fn = vi
      .fn()
      .mockReturnValueOnce(old.promise)
      .mockReturnValueOnce(current.promise)
      .mockResolvedValue(undefined);
    const { rerender } = renderHook(
      ({ enabled }) => usePoll(fn, 1000, enabled),
      { initialProps: { enabled: true } },
    );
    act(() => vi.advanceTimersByTime(1000));
    rerender({ enabled: false });
    rerender({ enabled: true });
    act(() => vi.advanceTimersByTime(1000));
    expect(fn).toHaveBeenCalledTimes(2);
    await act(async () => {
      if (outcome === "resolve") old.resolve();
      else old.reject(new Error("Old poll failed"));
      await Promise.resolve();
    });
    act(() => {
      window.dispatchEvent(new Event("focus"));
      vi.advanceTimersByTime(3000);
    });
    expect(fn).toHaveBeenCalledTimes(2);
    await act(async () => {
      current.resolve();
      await current.promise;
    });
    act(() => vi.advanceTimersByTime(1000));
    expect(fn).toHaveBeenCalledTimes(3);
  },
);
