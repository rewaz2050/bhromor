// @vitest-environment jsdom
/**
 * Batch H (2026-09-18): background refresh that stops in a hidden tab and
 * refreshes the moment the operator looks again.
 */
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePoll } from "../use-poll";
import { logError } from "../logger";
vi.mock("../logger", () => ({ logError: vi.fn() }));

let visibility: DocumentVisibilityState = "visible";

const setVisibility = (state: DocumentVisibilityState) => {
  visibility = state;
  document.dispatchEvent(new Event("visibilitychange"));
};

beforeEach(() => {
  vi.useFakeTimers();
  visibility = "visible";
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => visibility,
  });
});
afterEach(() => {
  vi.useRealTimers();
});

describe("usePoll", () => {
  it("ticks on the interval while visible and stops on unmount", () => {
    const fn = vi.fn();
    const { unmount } = renderHook(() => usePoll(fn, 1000));
    expect(fn).not.toHaveBeenCalled(); // the caller does its own first load
    vi.advanceTimersByTime(3000);
    expect(fn).toHaveBeenCalledTimes(3);
    unmount();
    vi.advanceTimersByTime(3000);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("stops while the tab is hidden and refreshes immediately when it returns", () => {
    const fn = vi.fn();
    renderHook(() => usePoll(fn, 1000));
    setVisibility("hidden");
    vi.advanceTimersByTime(5000);
    expect(fn).not.toHaveBeenCalled();
    setVisibility("visible");
    expect(fn).toHaveBeenCalledTimes(1); // instant catch-up
    vi.advanceTimersByTime(2000);
    expect(fn).toHaveBeenCalledTimes(3); // and the timer is armed again
  });

  it("does not start a timer when mounted in a hidden tab", () => {
    visibility = "hidden";
    const fn = vi.fn();
    renderHook(() => usePoll(fn, 1000));
    vi.advanceTimersByTime(3000);
    expect(fn).not.toHaveBeenCalled();
    setVisibility("visible");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("refreshes on window focus (visible only)", () => {
    const fn = vi.fn();
    renderHook(() => usePoll(fn, 60_000));
    window.dispatchEvent(new Event("focus"));
    expect(fn).toHaveBeenCalledTimes(1);
    visibility = "hidden";
    window.dispatchEvent(new Event("focus"));
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("does nothing when disabled or with a zero interval, and always calls the LATEST callback", () => {
    const off = vi.fn();
    renderHook(() => usePoll(off, 1000, false));
    renderHook(() => usePoll(off, 0));
    vi.advanceTimersByTime(3000);
    expect(off).not.toHaveBeenCalled();

    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(({ cb }) => usePoll(cb, 1000), { initialProps: { cb: first } });
    rerender({ cb: second });
    vi.advanceTimersByTime(1000);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});


it("does not overlap an unfinished poll with focus/visibility/interval refreshes", async () => {
  let finish = () => {};
  const pending = new Promise<void>(resolve => { finish = resolve; });
  const fn = vi.fn(() => pending);
  renderHook(() => usePoll(fn, 1000));
  vi.advanceTimersByTime(1000);
  window.dispatchEvent(new Event("focus"));
  setVisibility("hidden"); setVisibility("visible");
  vi.advanceTimersByTime(3000);
  expect(fn).toHaveBeenCalledOnce();
  await act(async () => { finish(); await pending; });
  vi.advanceTimersByTime(1000);
  expect(fn).toHaveBeenCalledTimes(2);
});


it("reports a rejected refresh and allows the next poll", async () => {
  const fn = vi.fn().mockRejectedValueOnce(new Error("Unavailable")).mockResolvedValue(undefined);
  renderHook(() => usePoll(fn, 1000));
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  expect(logError).toHaveBeenCalledWith("Background refresh failed", expect.any(Error));
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  expect(fn).toHaveBeenCalledTimes(2);
});
it("reports a synchronous refresh exception without disabling future polls", () => {
  const fn = vi.fn().mockImplementationOnce(() => { throw new Error("Unavailable"); }).mockReturnValue(undefined);
  renderHook(() => usePoll(fn, 1000));
  vi.advanceTimersByTime(2000);
  expect(fn).toHaveBeenCalledTimes(2);
});
