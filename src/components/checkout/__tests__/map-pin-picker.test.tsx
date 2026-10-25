import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import MapPinPicker from "../map-pin-picker";

const qa = vi.hoisted(() => ({ fail: false, click: undefined as ((event: { latlng: { lat: number; lng: number } }) => void) | undefined, tileError: undefined as (() => void) | undefined, remove: vi.fn() }));
vi.mock("@/components/i18n/language-provider", () => ({ useLanguage: () => ({ lang: "en", t: (key: string) => key }) }));
vi.mock("leaflet", () => ({
  Icon: { Default: { mergeOptions: vi.fn() } },
  map: vi.fn(() => {
    if (qa.fail) throw new Error("Map unavailable");
    return { on: (_event: string, callback: typeof qa.click) => { qa.click = callback; }, remove: qa.remove, invalidateSize: vi.fn(), setView: vi.fn(), getZoom: () => 14 };
  }),
  tileLayer: () => ({ addTo() { return this; }, on(_event: string, callback: () => void) { qa.tileError = callback; return this; } }),
  divIcon: vi.fn(),
  circle: () => ({ addTo: vi.fn() }),
  marker: () => ({ addTo() { return this; }, bindPopup() { return this; }, on: vi.fn(), setLatLng: vi.fn(), setPopupContent: vi.fn() }),
}));
beforeEach(() => { qa.fail = false; qa.click = undefined; qa.tileError = undefined; qa.remove.mockClear(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it("uses local Leaflet styles rather than injecting a CDN stylesheet", async () => {
  render(<MapPinPicker value={null} onChange={vi.fn()} />);
  await waitFor(() => expect(qa.click).toBeTypeOf("function"));
  expect(document.querySelector('link[href*="unpkg.com/leaflet"]')).toBeNull();
});
it("recovers from a map initialization failure", async () => {
  qa.fail = true;
  render(<MapPinPicker value={null} onChange={vi.fn()} />);
  expect(await screen.findByRole("status")).toHaveTextContent("Map could not load");
  qa.fail = false;
  fireEvent.click(screen.getByRole("button", { name: "Retry map" }));
  await waitFor(() => expect(qa.click).toBeTypeOf("function"));
  expect(screen.queryByText(/Map could not load/)).not.toBeInTheDocument();
});
it("reports blocked tiles and retains manual pin selection", async () => {
  const onChange = vi.fn();
  render(<MapPinPicker value={null} onChange={onChange} />);
  await waitFor(() => expect(qa.tileError).toBeTypeOf("function"));
  act(() => qa.tileError?.());
  expect(screen.getByRole("status")).toHaveTextContent("Street details are unavailable");
  act(() => qa.click?.({ latlng: { lat: 25.08, lng: 91.4 } }));
  expect(onChange).toHaveBeenCalledWith({ lat: 25.08, lng: 91.4 });
});
it("uses current callbacks after a parent rerenders without recreating the map", async () => {
  const oldChange = vi.fn(); const newChange = vi.fn();
  const view = render(<MapPinPicker value={null} onChange={oldChange} />);
  await waitFor(() => expect(qa.click).toBeTypeOf("function"));
  view.rerender(<MapPinPicker value={null} onChange={newChange} />);
  act(() => qa.click?.({ latlng: { lat: 25.08, lng: 91.4 } }));
  expect(newChange).toHaveBeenCalledOnce();
  expect(oldChange).not.toHaveBeenCalled();
});

it("reports geolocation denial without changing the selected address", async () => {
  const onChange = vi.fn();
  vi.stubGlobal("navigator", { userAgent: "test", geolocation: { getCurrentPosition: (_ok: unknown, fail: () => void) => fail() } });
  render(<MapPinPicker value={null} onChange={onChange} />);
  fireEvent.click(screen.getByRole("button", { name: "mapPin.useMyLocation" }));
  expect(screen.getByRole("status")).toHaveTextContent("Location unavailable");
  expect(onChange).not.toHaveBeenCalled();
});
it("does not apply a geolocation result after unmount", async () => {
  let complete: ((pos: { coords: { latitude: number; longitude: number } }) => void) | undefined;
  vi.stubGlobal("navigator", { userAgent: "test", geolocation: { getCurrentPosition: (success: typeof complete) => { complete = success; } } });
  const onChange = vi.fn();
  const view = render(<MapPinPicker value={null} onChange={onChange} />);
  fireEvent.click(screen.getByRole("button", { name: "mapPin.useMyLocation" }));
  view.unmount();
  act(() => complete?.({ coords: { latitude: 25.08, longitude: 91.4 } }));
  expect(onChange).not.toHaveBeenCalled();
});

it.each([{ latitude: 23.8, longitude: 90.4 }, { latitude: NaN, longitude: 91.4 }])("O10: rejects outside/invalid GPS without a fabricated boundary pin: %j", async coords => {
  const onChange = vi.fn(); const onZoneDetected = vi.fn();
  vi.stubGlobal("navigator", { userAgent: "test", geolocation: { getCurrentPosition: (ok: (pos: unknown) => void) => ok({ coords }) } });
  render(<MapPinPicker value={null} onChange={onChange} onZoneDetected={onZoneDetected} />);
  await waitFor(() => expect(qa.click).toBeTypeOf("function"));
  fireEvent.click(screen.getByRole("button", { name: "mapPin.useMyLocation" }));
  expect(onChange).not.toHaveBeenCalled(); expect(onZoneDetected).not.toHaveBeenCalled();
  expect(screen.getByRole("status")).toHaveTextContent(/outside|unavailable/i);
});
it("O10: passes valid local GPS coordinates unchanged to pin and zone callbacks", async () => {
  const onChange = vi.fn(); const onZoneDetected = vi.fn();
  vi.stubGlobal("navigator", { userAgent: "test", geolocation: { getCurrentPosition: (ok: (pos: unknown) => void) => ok({ coords: { latitude: 25.08, longitude: 91.4 } }) } });
  render(<MapPinPicker value={null} onChange={onChange} onZoneDetected={onZoneDetected} />);
  await waitFor(() => expect(qa.click).toBeTypeOf("function"));
  fireEvent.click(screen.getByRole("button", { name: "mapPin.useMyLocation" }));
  expect(onChange).toHaveBeenCalledWith({ lat: 25.08, lng: 91.4 }); expect(onZoneDetected).toHaveBeenCalledOnce();
});
