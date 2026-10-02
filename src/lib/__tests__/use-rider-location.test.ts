import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { IDLE_PING_MS, TRIP_PING_MS, useRiderLocationTracking } from "../use-rider-location";

type PosCb = (p: { coords: { latitude: number; longitude: number } }) => void;

let onFix: PosCb;
let onError: (e: { code: number }) => void;
const geo = {
  watchPosition: vi.fn((cb: PosCb, err?: (e: { code: number }) => void) => {
    onFix = cb;
    if (err) onError = err;
    return 42;
  }),
  clearWatch: vi.fn(),
  getCurrentPosition: vi.fn((cb: PosCb) => cb({ coords: { latitude: 24.9, longitude: 91.8 } })),
};
const fix = (lat: number, lng: number) => onFix({ coords: { latitude: lat, longitude: lng } });

beforeEach(() => {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
  vi.useFakeTimers();
  vi.stubGlobal("navigator", { geolocation: geo });
  geo.watchPosition.mockClear();
  geo.clearWatch.mockClear();
  geo.getCurrentPosition.mockClear();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("useRiderLocationTracking", () => {
  it("does nothing while disabled (offline / signed out)", () => {
    renderHook(() => useRiderLocationTracking({ enabled: false, hasActiveTrip: false, send: vi.fn() }));
    expect(geo.watchPosition).not.toHaveBeenCalled();
  });

  it("does nothing on a device without geolocation", () => {
    vi.stubGlobal("navigator", {});
    expect(() => renderHook(() => useRiderLocationTracking({ enabled: true, hasActiveTrip: false, send: vi.fn() }))).not.toThrow();
  });

  it("sends the first fix, drops a twitch under 50 m, sends a real move", () => {
    const send = vi.fn();
    renderHook(() => useRiderLocationTracking({ enabled: true, hasActiveTrip: false, send }));
    fix(24.9, 91.8);
    expect(send).toHaveBeenCalledWith(24.9, 91.8);
    fix(24.90001, 91.80001); // ~1 m
    expect(send).toHaveBeenCalledTimes(1);
    fix(24.91, 91.8); // ~1.1 km
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("a standing-still rider still gets the 2-minute heartbeat", () => {
    const send = vi.fn();
    renderHook(() => useRiderLocationTracking({ enabled: true, hasActiveTrip: false, send }));
    fix(24.9, 91.8);
    vi.advanceTimersByTime(60_000);
    fix(24.9, 91.8);
    expect(send).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(60_001);
    fix(24.9, 91.8);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("the fallback ping runs every 30 s on a trip and every 2 min when idle", () => {
    const trip = renderHook(() => useRiderLocationTracking({ enabled: true, hasActiveTrip: true, send: vi.fn() }));
    vi.advanceTimersByTime(TRIP_PING_MS);
    expect(geo.getCurrentPosition).toHaveBeenCalledTimes(1);
    trip.unmount();
    geo.getCurrentPosition.mockClear();
    renderHook(() => useRiderLocationTracking({ enabled: true, hasActiveTrip: false, send: vi.fn() }));
    vi.advanceTimersByTime(TRIP_PING_MS);
    expect(geo.getCurrentPosition).not.toHaveBeenCalled();
    vi.advanceTimersByTime(IDLE_PING_MS - TRIP_PING_MS);
    expect(geo.getCurrentPosition).toHaveBeenCalledTimes(1);
  });

  it("stops watching and pinging on unmount, and when switched off", () => {
    const { unmount, rerender } = renderHook(
      ({ enabled }) => useRiderLocationTracking({ enabled, hasActiveTrip: true, send: vi.fn() }),
      { initialProps: { enabled: true } },
    );
    rerender({ enabled: false });
    expect(geo.clearWatch).toHaveBeenCalledWith(42);
    geo.getCurrentPosition.mockClear();
    vi.advanceTimersByTime(TRIP_PING_MS * 3);
    expect(geo.getCurrentPosition).not.toHaveBeenCalled();
    unmount();
  });

  it("always calls the LATEST sender without re-subscribing the GPS watch", () => {
    const a = vi.fn();
    const b = vi.fn();
    const { rerender } = renderHook(({ send }) => useRiderLocationTracking({ enabled: true, hasActiveTrip: false, send }), {
      initialProps: { send: a },
    });
    rerender({ send: b });
    expect(geo.watchPosition).toHaveBeenCalledTimes(1);
    fix(24.9, 91.8);
    expect(b).toHaveBeenCalledTimes(1);
    expect(a).not.toHaveBeenCalled();
  });

  /* ---------------- item Q ---------------- */

  const goVisible = () => document.dispatchEvent(new Event("visibilitychange"));
  const setVisibility = (v: DocumentVisibilityState) =>
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => v });

  it("reports the last device fix time and clears any earlier error", () => {
    vi.setSystemTime(new Date("2026-10-02T10:00:00Z"));
    const { result } = renderHook(() => useRiderLocationTracking({ enabled: true, hasActiveTrip: false, send: vi.fn() }));
    expect(result.current.lastFixAt).toBeNull();
    act(() => fix(24.9, 91.8));
    expect(result.current.lastFixAt).toBe(Date.parse("2026-10-02T10:00:00Z"));
    expect(result.current.lastError).toBeNull();
  });

  it("records a GPS error kind, and a later fix clears it", () => {
    const { result } = renderHook(() => useRiderLocationTracking({ enabled: true, hasActiveTrip: false, send: vi.fn() }));
    act(() => onError({ code: 1 }));
    expect(result.current.lastError).toBe("denied");
    act(() => onError({ code: 3 }));
    expect(result.current.lastError).toBe("timeout");
    act(() => fix(24.9, 91.8));
    expect(result.current.lastError).toBeNull();
  });

  it("flags a failed upload (false or rejected) and clears it on the next good one", async () => {
    const send = vi.fn().mockResolvedValueOnce(false).mockRejectedValueOnce(new Error("net")).mockResolvedValue(true);
    const { result } = renderHook(() => useRiderLocationTracking({ enabled: true, hasActiveTrip: false, send }));
    await act(async () => fix(24.9, 91.8));
    expect(result.current.sendFailed).toBe(true);
    await act(async () => fix(24.95, 91.8));
    expect(result.current.sendFailed).toBe(true);
    await act(async () => fix(25.0, 91.8));
    expect(result.current.sendFailed).toBe(false);
  });

  it("coming back to the app sends a fresh fix at once, even standing still", () => {
    const send = vi.fn();
    renderHook(() => useRiderLocationTracking({ enabled: true, hasActiveTrip: true, send }));
    act(() => fix(24.9, 91.8));
    expect(send).toHaveBeenCalledTimes(1);
    setVisibility("hidden");
    act(goVisible);
    expect(send).toHaveBeenCalledTimes(1); // hiding is not "coming back"
    expect(geo.getCurrentPosition).not.toHaveBeenCalled();
    setVisibility("visible");
    act(goVisible);
    expect(geo.getCurrentPosition).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledTimes(2); // same spot, but forced
  });

  it("forgets this session's health when switched off", () => {
    const { result, rerender } = renderHook(({ enabled }) => useRiderLocationTracking({ enabled, hasActiveTrip: false, send: vi.fn() }), {
      initialProps: { enabled: true },
    });
    act(() => fix(24.9, 91.8));
    act(() => onError({ code: 2 }));
    rerender({ enabled: false });
    expect(result.current).toMatchObject({ lastFixAt: null, lastError: null, sendFailed: false });
  });

  it("stops listening for visibility changes after unmount", () => {
    const send = vi.fn();
    const { unmount } = renderHook(() => useRiderLocationTracking({ enabled: true, hasActiveTrip: false, send }));
    unmount();
    setVisibility("visible");
    document.dispatchEvent(new Event("visibilitychange"));
    expect(geo.getCurrentPosition).not.toHaveBeenCalled();
  });

  it("follows the browser's permission state, including a later revocation", async () => {
    let change: () => void = () => {};
    const status = { state: "granted", addEventListener: (_: string, f: () => void) => (change = f), removeEventListener: vi.fn() };
    vi.stubGlobal("navigator", { geolocation: geo, permissions: { query: vi.fn(async () => status) } });
    vi.useRealTimers();
    const { result } = renderHook(() => useRiderLocationTracking({ enabled: true, hasActiveTrip: false, send: vi.fn() }));
    await waitFor(() => expect(result.current.permission).toBe("granted"));
    status.state = "denied";
    act(() => change());
    expect(result.current.permission).toBe("denied");
  });

  it("works on browsers without the Permissions API", () => {
    const { result } = renderHook(() => useRiderLocationTracking({ enabled: true, hasActiveTrip: false, send: vi.fn() }));
    expect(result.current.permission).toBeNull();
  });
});
