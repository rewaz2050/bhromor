/**
 * The shared "keep this page honest" tick (2026-10-11).
 *
 * Both the tracker and the account's order list depend on this for the one
 * thing they cannot do themselves: notice that the world moved while the page
 * was open. The behaviours worth pinning are the tick, the stop condition, the
 * hidden-tab pause and the cleanup — a leaked interval on a page a shopper
 * leaves open all evening is a battery drain, not a rounding error.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useLiveRefresh } from "@/lib/use-live-refresh";

const advance = async (ms: number) => {
  await vi.advanceTimersByTimeAsync(ms);
};

const setVisibility = (value: string) => {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => value,
  });
};

beforeEach(() => {
  vi.useFakeTimers();
  setVisibility("visible");
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("useLiveRefresh", () => {
  it("ticks on the interval while enabled", async () => {
    const onTick = vi.fn();
    renderHook(() => useLiveRefresh(true, 15_000, onTick));
    expect(onTick).not.toHaveBeenCalled();
    await advance(15_000);
    expect(onTick).toHaveBeenCalledTimes(1);
    await advance(30_000);
    expect(onTick).toHaveBeenCalledTimes(3);
  });

  it("does nothing at all while disabled", async () => {
    const onTick = vi.fn();
    renderHook(() => useLiveRefresh(false, 15_000, onTick));
    await advance(60_000);
    expect(onTick).not.toHaveBeenCalled();
  });

  it("stops when the stop condition turns off — the parcel landed", async () => {
    const onTick = vi.fn();
    const { rerender } = renderHook(({ on }: { on: boolean }) => useLiveRefresh(on, 15_000, onTick), {
      initialProps: { on: true },
    });
    await advance(15_000);
    expect(onTick).toHaveBeenCalledTimes(1);
    rerender({ on: false });
    await advance(60_000);
    expect(onTick).toHaveBeenCalledTimes(1);
  });

  it("skips a hidden tab and picks back up when it is looked at again", async () => {
    const onTick = vi.fn();
    renderHook(() => useLiveRefresh(true, 15_000, onTick));
    setVisibility("hidden");
    await advance(45_000);
    expect(onTick).not.toHaveBeenCalled();
    setVisibility("visible");
    await advance(15_000);
    expect(onTick).toHaveBeenCalledTimes(1);
  });

  it("clears its interval on unmount", async () => {
    const onTick = vi.fn();
    const { unmount } = renderHook(() => useLiveRefresh(true, 15_000, onTick));
    unmount();
    await advance(60_000);
    expect(onTick).not.toHaveBeenCalled();
  });
});
