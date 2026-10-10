/**
 * The customer's real map. Leaflet is mocked: what matters here is the wiring
 * this component owns — which pins exist, when the rider pin slides instead of
 * jumping, that the map follows the rider until the customer pans it, and that
 * a Leaflet that cannot load hands control back to the schematic instead of
 * leaving a blank rectangle.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { RiderTileMap } from "../rider-tile-map";

const hub = { lat: 25.0703, lng: 91.4067 };
const door = { lat: 25.0748, lng: 91.4 };
const north = { lat: 25.0803, lng: 91.4067 }; // ~1.1 km north of the hub
const far = { lat: 25.1203, lng: 91.4567 }; // ~7 km away — a GPS correction

const state = vi.hoisted(() => ({
  mapOpts: null as Record<string, unknown> | null,
  markerCalls: [] as [number, number][],
  setLatLngCalls: [] as [number, number][],
  polylinePaths: [] as [number, number][][],
  removedLayers: 0,
  setViewCalls: [] as [number, number][],
  fitBoundsCalls: [] as number[],
  mapFails: false,
}));

const marker = () => ({
  addTo: vi.fn(function (this: unknown) {
    return this;
  }),
  setLatLng: vi.fn((latlng: [number, number]) => {
    state.setLatLngCalls.push(latlng);
  }),
  setIcon: vi.fn(),
  setPopupContent: vi.fn(),
  bindPopup: vi.fn(),
});

vi.mock("leaflet", () => {
  const mapInstance = {
    on: vi.fn(),
    remove: vi.fn(),
    invalidateSize: vi.fn(),
    getZoom: () => 14,
    setView: vi.fn((c: [number, number]) => {
      state.setViewCalls.push(c);
    }),
    fitBounds: vi.fn(() => {
      state.fitBoundsCalls.push(1);
    }),
    removeLayer: vi.fn(() => {
      state.removedLayers += 1;
    }),
  };
  return {
    map: vi.fn((_el: unknown, opts: Record<string, unknown>) => {
      state.mapOpts = opts;
      if (state.mapFails) throw new Error("no canvas here");
      return mapInstance;
    }),
    tileLayer: vi.fn(() => ({ addTo: vi.fn() })),
    divIcon: vi.fn((o: Record<string, unknown>) => ({ options: o })),
    marker: vi.fn((latlng: [number, number]) => {
      state.markerCalls.push(latlng);
      return marker();
    }),
    polyline: vi.fn((path: [number, number][]) => {
      state.polylinePaths.push(path);
      const line = {
        // Leaflet's addTo returns the layer; the component assigns the layer
        // explicitly, but the mock stays faithful to the real signature.
        addTo: vi.fn(function (this: unknown) {
          return this;
        }),
        setLatLngs: vi.fn((p: [number, number][]) => {
          state.polylinePaths.push(p);
        }),
      };
      return line;
    }),
  };
});

const flush = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};

beforeEach(() => {
  state.mapOpts = null;
  state.markerCalls = [];
  state.setLatLngCalls = [];
  state.polylinePaths = [];
  state.removedLayers = 0;
  state.setViewCalls = [];
  state.fitBoundsCalls = [];
  state.mapFails = false;
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("RiderTileMap", () => {
  it("opens on the real coordinates and does not hijack page scroll", async () => {
    render(<RiderTileMap destination={door} rider={hub} />);
    await flush();
    expect(screen.getByTestId("rider-tile-map")).toBeInTheDocument();
    expect(state.mapOpts).toMatchObject({ scrollWheelZoom: false });
    const [lat, lng] = state.mapOpts!.center as [number, number];
    // Opens centred between the rider and the door, not on a default city.
    expect(lat).toBeCloseTo((door.lat + hub.lat) / 2, 5);
    expect(lng).toBeCloseTo((door.lng + hub.lng) / 2, 5);
  });

  it("draws a pin for the rider and one for the door, and the line between", async () => {
    render(<RiderTileMap destination={door} rider={hub} destinationLabel="Kandirpar" />);
    await flush();
    // Two markers: door + rider.
    expect(state.markerCalls).toHaveLength(2);
    expect(state.markerCalls).toContainEqual([door.lat, door.lng]);
    expect(state.markerCalls).toContainEqual([hub.lat, hub.lng]);
    expect(state.polylinePaths.length).toBeGreaterThan(0);
  });

  it("draws no door pin when checkout never captured one", async () => {
    render(<RiderTileMap destination={null} rider={hub} />);
    await flush();
    expect(state.markerCalls).toEqual([[hub.lat, hub.lng]]);
  });

  it("slides the rider pin across a real move instead of teleporting it", async () => {
    // Real timers on purpose: the slide runs on requestAnimationFrame, which
    // Vitest's fake clock does not drive.
    const { rerender } = render(<RiderTileMap destination={door} rider={hub} />);
    await flush();
    state.setLatLngCalls = [];
    rerender(<RiderTileMap destination={door} rider={north} />);
    await flush();
    const frames = async (ms: number) => {
      await act(async () => {
        await new Promise((r) => setTimeout(r, ms));
      });
    };
    state.polylinePaths = [];
    await frames(60);
    // Mid-slide: intermediate positions, and still short of the new fix.
    expect(state.setLatLngCalls.length).toBeGreaterThan(1);
    const mid = state.setLatLngCalls.at(-1)!;
    expect(mid[0]).toBeGreaterThanOrEqual(hub.lat);
    expect(mid[0]).toBeLessThanOrEqual(north.lat);
    // The route line follows the pin frame by frame, it does not jump ahead.
    expect(state.polylinePaths.length).toBeGreaterThan(1);
    expect(state.polylinePaths.at(-1)![0][0]).toBeCloseTo(mid[0], 9);
    // Settles on the rider's real fix (a metre or two is one screen pixel at
    // this zoom; the last frame lands it exactly).
    await frames(2600);
    const last = state.setLatLngCalls.at(-1)!;
    expect(last[0]).toBeCloseTo(north.lat, 5);
    expect(last[1]).toBeCloseTo(north.lng, 5);
  }, 15_000);

  it("snaps a >2 km jump — that is a GPS correction, not travel", async () => {
    vi.useFakeTimers();
    const { rerender } = render(<RiderTileMap destination={door} rider={hub} />);
    await flush();
    state.setLatLngCalls = [];
    rerender(<RiderTileMap destination={door} rider={far} />);
    await flush();
    expect(state.setLatLngCalls).toEqual([[far.lat, far.lng]]);
  });

  it("takes the rider pin off the map when the fix goes away", async () => {
    const { rerender } = render(<RiderTileMap destination={door} rider={hub} />);
    await flush();
    state.removedLayers = 0;
    rerender(<RiderTileMap destination={door} rider={null} />);
    await flush();
    expect(state.removedLayers).toBeGreaterThan(0);
  });

  it("reports failure instead of showing a blank rectangle when Leaflet will not build", async () => {
    state.mapFails = true;
    const onFailed = vi.fn();
    render(<RiderTileMap destination={door} rider={hub} onFailed={onFailed} />);
    await flush();
    expect(onFailed).toHaveBeenCalledTimes(1);
  });

  it("shows the placeholder until the tiles are up", async () => {
    render(<RiderTileMap destination={door} rider={hub} />);
    expect(screen.getByText("ম্যাপ লোড হচ্ছে…")).toBeInTheDocument();
    await flush();
    expect(screen.queryByText("ম্যাপ লোড হচ্ছে…")).not.toBeInTheDocument();
  });
});
