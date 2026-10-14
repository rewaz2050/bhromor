import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { IDLE_PING_MS, TRIP_PING_MS, useRiderLocationTracking } from "../use-rider-location";

/**
 * The native engine is mocked here: what matters is the hook's CHOICE between
 * the two engines and that both feed the same throttle and health reporting.
 * The plugin itself is covered by native-location.test.ts.
 */
const nativeState = vi.hoisted(() => ({
  available: false,
  starts: 0,
  stops: 0,
  opts: null as null | { onFix: (lat: number, lng: number) => void; onError: (k: string) => void },
  result: "started" as "started" | "not-native",
}));

vi.mock("../native-location", () => ({
  nativeGpsAvailable: () => nativeState.available,
  startNativeGps: async (opts: {
    onFix: (lat: number, lng: number) => void;
    onError: (k: string) => void;
  }) => {
    nativeState.starts += 1;
    nativeState.opts = opts;
    return nativeState.result === "started"
      ? { started: true as const, stop: () => { nativeState.stops += 1; } }
      : { started: false as const, reason: "not-native" as const };
  },
}));

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
  nativeState.available = false;
  nativeState.starts = 0;
  nativeState.stops = 0;
  nativeState.opts = null;
  nativeState.result = "started";
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

/* ------------------------------------------------------------------ *
 * The installed app's engine — the one a browser cannot provide
 * ------------------------------------------------------------------ */

describe("useRiderLocationTracking inside the Android app", () => {
  const settle = async () => {
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
  };

  it("uses the native service and never touches navigator.geolocation", async () => {
    nativeState.available = true;
    const { result } = renderHook(() =>
      useRiderLocationTracking({ enabled: true, hasActiveTrip: true, send: vi.fn() }),
    );
    await settle();
    expect(nativeState.starts).toBe(1);
    expect(geo.watchPosition).not.toHaveBeenCalled();
    expect(result.current.engine).toBe("native");
    // The service reports its own errors, so no fallback ping is armed.
    vi.advanceTimersByTime(TRIP_PING_MS * 2);
    expect(geo.getCurrentPosition).not.toHaveBeenCalled();
  });

  it("still uploads through the same 50 m throttle", async () => {
    nativeState.available = true;
    const send = vi.fn();
    renderHook(() =>
      useRiderLocationTracking({ enabled: true, hasActiveTrip: true, send }),
    );
    await settle();
    nativeState.opts!.onFix(24.9, 91.8);
    expect(send).toHaveBeenCalledTimes(1);
    nativeState.opts!.onFix(24.90001, 91.80001); // ~1 m — filtered out
    expect(send).toHaveBeenCalledTimes(1);
    nativeState.opts!.onFix(24.91, 91.8); // ~1.1 km
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("records the last fix and clears an earlier error", async () => {
    nativeState.available = true;
    vi.setSystemTime(new Date("2026-10-09T09:00:00Z"));
    const { result } = renderHook(() =>
      useRiderLocationTracking({ enabled: true, hasActiveTrip: true, send: vi.fn() }),
    );
    await settle();
    act(() => nativeState.opts!.onError("unavailable"));
    expect(result.current.lastError).toBe("unavailable");
    act(() => nativeState.opts!.onFix(24.9, 91.8));
    expect(result.current.lastError).toBeNull();
    expect(result.current.lastFixAt).toBe(Date.parse("2026-10-09T09:00:00Z"));
  });

  it("falls back to the browser when an older APK has no plugin", async () => {
    nativeState.available = true;
    nativeState.result = "not-native";
    const { result } = renderHook(() =>
      useRiderLocationTracking({ enabled: true, hasActiveTrip: true, send: vi.fn() }),
    );
    await settle();
    expect(geo.watchPosition).toHaveBeenCalledTimes(1);
    expect(result.current.engine).toBe("browser");
  });

  it("stops the service when the rider goes offline", async () => {
    nativeState.available = true;
    const { rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) =>
        useRiderLocationTracking({ enabled, hasActiveTrip: true, send: vi.fn() }),
      { initialProps: { enabled: true } },
    );
    await settle();
    rerender({ enabled: false });
    expect(nativeState.stops).toBe(1);
  });

  it("never starts an engine while offline", async () => {
    nativeState.available = true;
    renderHook(() =>
      useRiderLocationTracking({ enabled: false, hasActiveTrip: true, send: vi.fn() }),
    );
    await settle();
    expect(nativeState.starts).toBe(0);
  });
});
