/**
 * The clock that must not twitch on load (flicker pass 2026-10-07).
 *
 * A countdown rendered against a fixed epoch is the classic storefront
 * flicker: server HTML says one thing, the first client render says another,
 * and the shopper watches the number change. The fix is an aligned clock —
 * both sides floor to the same interval.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { alignedNow, useNow } from "../use-now";

describe("alignedNow", () => {
  it("floors to the interval, so a render and a hydration agree", () => {
    const minute = 60_000;
    // Two reads one second apart inside the same minute answer the same
    // second — the server's HTML and the client's first render match.
    const a = Date.parse("2026-10-07T10:00:01Z");
    const b = Date.parse("2026-10-07T10:00:59Z");
    expect(alignedNow(minute, a)).toBe(alignedNow(minute, b));
    expect(alignedNow(minute, a)).toBe(Date.parse("2026-10-07T10:00:00Z"));
  });

  it("matters most on the fast clocks — a 1 s countdown must not jump", () => {
    const second = 1000;
    const a = Date.parse("2026-10-07T10:00:01Z") + 120;
    const b = Date.parse("2026-10-07T10:00:01Z") + 900;
    expect(alignedNow(second, a)).toBe(alignedNow(second, b));
  });

  it("does not floor a zero interval — a per-second clock stays exact", () => {
    const at = Date.parse("2026-10-07T10:00:59Z");
    expect(alignedNow(0, at)).toBe(at);
  });
});

describe("useNow", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("serves the aligned clock to the server and the client alike", () => {
    vi.setSystemTime(Date.parse("2026-10-07T10:00:30Z"));
    const { result } = renderHook(() => useNow(60_000));
    expect(result.current).toBe(Date.parse("2026-10-07T10:00:00Z"));
  });

  it("ticks forward, once per interval", () => {
    vi.setSystemTime(Date.parse("2026-10-07T10:00:00Z"));
    const { result } = renderHook(() => useNow(60_000));
    const first = result.current;
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(result.current).toBe(first + 60_000);
  });
});
