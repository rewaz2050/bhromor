import { afterEach, describe, expect, it, vi } from "vitest";
import { afterFirstPaint } from "../defer";

/** Audit 2026-09-17 P2.5 — non-critical boot fetches run after first paint. */

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("afterFirstPaint", () => {
  it("runs synchronously where there is no frame scheduler (SSR / plain tests)", () => {
    vi.stubGlobal("requestAnimationFrame", undefined);
    const fn = vi.fn();
    afterFirstPaint(fn);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("waits for a frame, then idle time, before running", () => {
    const rafs: FrameRequestCallback[] = [];
    const idles: IdleRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      rafs.push(cb);
      return rafs.length;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    vi.stubGlobal("requestIdleCallback", (cb: IdleRequestCallback, opts?: IdleRequestOptions) => {
      idles.push(cb);
      expect(opts?.timeout).toBe(1500);
      return idles.length;
    });
    vi.stubGlobal("cancelIdleCallback", vi.fn());

    const fn = vi.fn();
    afterFirstPaint(fn);
    expect(fn).not.toHaveBeenCalled();
    rafs[0](0);
    expect(fn).not.toHaveBeenCalled();
    idles[0]({ didTimeout: false, timeRemaining: () => 50 });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("falls back to a short timer where requestIdleCallback is missing (Safari)", () => {
    vi.useFakeTimers();
    const rafs: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      rafs.push(cb);
      return rafs.length;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    vi.stubGlobal("requestIdleCallback", undefined);
    // `"requestIdleCallback" in window` must be false
    delete (window as unknown as Record<string, unknown>).requestIdleCallback;

    const fn = vi.fn();
    afterFirstPaint(fn);
    rafs[0](0);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(60);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("the cancel handle prevents the run after unmount", () => {
    const rafs: FrameRequestCallback[] = [];
    const cancelRaf = vi.fn();
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      rafs.push(cb);
      return rafs.length;
    });
    vi.stubGlobal("cancelAnimationFrame", cancelRaf);
    const fn = vi.fn();
    const cancel = afterFirstPaint(fn);
    cancel();
    expect(cancelRaf).toHaveBeenCalledWith(1);
    rafs[0]?.(0);
    expect(fn).not.toHaveBeenCalled();
  });
});
