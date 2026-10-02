import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { IDLE_PING_MS, TRIP_PING_MS, useRiderLocationTracking } from "../use-rider-location";

type PosCb = (p: { coords: { latitude: number; longitude: number } }) => void;

let onFix: PosCb;
const geo = {
  watchPosition: vi.fn((cb: PosCb) => {
    onFix = cb;
    return 42;
  }),
  clearWatch: vi.fn(),
  getCurrentPosition: vi.fn((cb: PosCb) => cb({ coords: { latitude: 24.9, longitude: 91.8 } })),
};
const fix = (lat: number, lng: number) => onFix({ coords: { latitude: lat, longitude: lng } });

beforeEach(() => {
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
});
