import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import AdminLiveMap from "../admin-live-map";
import type { Rider } from "@/lib/catalog";

const qa = vi.hoisted(() => ({ markers: [] as number[][], fail: false, tileError: undefined as (() => void) | undefined, removes: vi.fn() }));
vi.mock("leaflet", () => {
  class Marker {
    options = { icon: { options: { className: "" } } };
    addTo() { return this; } bindPopup() { return this; }
  }
  return {
    Icon: { Default: { mergeOptions: vi.fn() } }, Marker, Polyline: class {},
    map: vi.fn(() => {
      if (qa.fail) throw new Error("Map initialization failed");
      return { eachLayer: vi.fn(), removeLayer: vi.fn(), remove: qa.removes, invalidateSize: vi.fn() };
    }),
    tileLayer: vi.fn(() => ({ addTo() { return this; }, on(_event: string, callback: () => void) { qa.tileError = callback; return this; } })),
    divIcon: vi.fn(),
    marker: vi.fn((point: number[]) => { qa.markers.push(point); return new Marker(); }),
    polyline: vi.fn(() => ({ addTo: vi.fn() })),
  };
});
beforeEach(() => { qa.markers = []; qa.fail = false; qa.tileError = undefined; qa.removes.mockClear(); });
afterEach(cleanup);
const riders = [{ id: "qa", name: "QA rider", phone: "01700000000", lat: 25.08, lng: 91.4, zoneIds: [], isOnline: true, vehicle: "bike", status: "active", cashInHand: 0, ratingAvg: 0, ratingCount: 0 }] satisfies Rider[];
it("renders existing rider pins on initial load without waiting for the minute tick", async () => {
  render(<AdminLiveMap riders={riders} orders={[]} deliveries={[]} />);
  await waitFor(() => expect(qa.markers).toContainEqual([25.08, 91.4]));
});

it("contains map panes and does not inject a CDN stylesheet", async () => {
  render(<AdminLiveMap riders={riders} orders={[]} deliveries={[]} />);
  await waitFor(() => expect(qa.markers).toContainEqual([25.08, 91.4]));
  expect(screen.getByRole("region", { name: "Live dispatch map" }).parentElement).toHaveClass("isolate", "overflow-hidden");
  expect(document.querySelector('link[href*="unpkg.com/leaflet"]')).toBeNull();
});
it("reports tile failure truthfully and recreates the map on explicit retry", async () => {
  render(<AdminLiveMap riders={riders} orders={[]} deliveries={[]} />);
  await waitFor(() => expect(qa.tileError).toBeTypeOf("function"));
  act(() => qa.tileError?.());
  expect(screen.getByRole("status")).toHaveTextContent("without street details");
  fireEvent.click(screen.getByRole("button", { name: "Retry map" }));
  await waitFor(() => expect(qa.removes).toHaveBeenCalledOnce());
  await waitFor(() => expect(qa.markers.filter(point => point[0] === 25.08)).toHaveLength(2));
  expect(screen.queryByText(/without street details/)).not.toBeInTheDocument();
});
it("recovers from an initialization failure without an endless spinner", async () => {
  qa.fail = true;
  render(<AdminLiveMap riders={riders} orders={[]} deliveries={[]} />);
  await screen.findByText(/dispatch map could not load/);
  expect(screen.queryByText("Loading live dispatch map...")).not.toBeInTheDocument();
  qa.fail = false;
  fireEvent.click(screen.getByRole("button", { name: "Retry map" }));
  await waitFor(() => expect(qa.markers).toContainEqual([25.08, 91.4]));
  expect(screen.queryByText(/dispatch map could not load/)).not.toBeInTheDocument();
});
it("removes the map on unmount", async () => {
  const view = render(<AdminLiveMap riders={riders} orders={[]} deliveries={[]} />);
  await waitFor(() => expect(qa.markers).toContainEqual([25.08, 91.4]));
  view.unmount(); expect(qa.removes).toHaveBeenCalledOnce();
});
