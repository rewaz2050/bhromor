import { describe, expect, it } from "vitest";
import {
  SLIDE_MAX_KM,
  asMapPoint,
  centerOf,
  doorPinHtml,
  easeOut,
  gapKm,
  lerpPoint,
  markerMotion,
  riderPinHtml,
  zoomForGapKm,
} from "../live-map";
import { SUNAMGANJ_HUB_COORDS } from "../sunamganj";

const HUB = { lat: SUNAMGANJ_HUB_COORDS.lat, lng: SUNAMGANJ_HUB_COORDS.lng };
/** ~1.1 km north of the hub. */
const NORTH = { lat: HUB.lat + 0.01, lng: HUB.lng };
/** ~5.5 km north-east — beyond any slide. */
const FAR = { lat: HUB.lat + 0.05, lng: HUB.lng + 0.02 };

describe("asMapPoint — nothing that is not a real place reaches the map", () => {
  it("accepts a finite in-range coordinate", () => {
    expect(asMapPoint(HUB)).toEqual(HUB);
  });

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["missing lng", { lat: 25.07 }],
    ["NaN", { lat: NaN, lng: 91.4 }],
    ["Infinity", { lat: Infinity, lng: 91.4 }],
    ["out of range", { lat: 95, lng: 91.4 }],
  ])("rejects %s", (_label, value) => {
    expect(asMapPoint(value as never)).toBeNull();
  });

  it("rejects 0,0 — the null island, not a delivery in Sunamganj", () => {
    expect(asMapPoint({ lat: 0, lng: 0 })).toBeNull();
  });
});

describe("centerOf / gapKm", () => {
  it("midpoints the real points and ignores the missing ones", () => {
    const c = centerOf([HUB, null, NORTH]);
    expect(c).not.toBeNull();
    expect(c!.lat).toBeCloseTo((HUB.lat + NORTH.lat) / 2, 6);
    expect(c!.lng).toBeCloseTo(HUB.lng, 6);
  });

  it("is null when there is nothing to look at", () => {
    expect(centerOf([null, undefined])).toBeNull();
    expect(centerOf([])).toBeNull();
  });

  it("measures the gap only when both ends are real", () => {
    expect(gapKm(HUB, NORTH)).toBeCloseTo(1.11, 1);
    expect(gapKm(HUB, null)).toBeNull();
  });
});

describe("zoomForGapKm — the rider stays in frame without becoming a dot", () => {
  it.each([
    [null, 14],
    [0.2, 17],
    [0.8, 16],
    [2, 15],
    [4, 14],
    [9, 13],
  ])("gap %s km → zoom %s", (km, zoom) => {
    expect(zoomForGapKm(km)).toBe(zoom);
  });

  it("never zooms out past the town", () => {
    expect(zoomForGapKm(500)).toBeGreaterThanOrEqual(13);
  });
});

describe("markerMotion — slide for travel, snap for a correction", () => {
  it("snaps the first pin", () => {
    expect(markerMotion(null, HUB)).toBe("snap");
    expect(markerMotion(HUB, null)).toBe("snap");
  });

  it("holds when the rider has not really moved", () => {
    // ~1 m north.
    expect(markerMotion(HUB, { lat: HUB.lat + 0.00001, lng: HUB.lng })).toBe("hold");
  });

  it("slides a real move", () => {
    expect(markerMotion(HUB, NORTH)).toBe("slide");
  });

  it("snaps a jump beyond the slide ceiling — a GPS correction, not travel", () => {
    expect(gapKm(HUB, FAR)!).toBeGreaterThan(SLIDE_MAX_KM);
    expect(markerMotion(HUB, FAR)).toBe("snap");
  });
});

describe("lerpPoint / easeOut — the slide itself", () => {
  it("starts at `from` and ends at `to`", () => {
    expect(lerpPoint(HUB, NORTH, 0)).toEqual(HUB);
    const end = lerpPoint(HUB, NORTH, 1);
    expect(end.lat).toBeCloseTo(NORTH.lat, 9);
    expect(end.lng).toBeCloseTo(NORTH.lng, 9);
  });

  it("is monotonic and never overshoots", () => {
    let prev = 0;
    for (let i = 0; i <= 10; i += 1) {
      const at = lerpPoint(HUB, NORTH, i / 10);
      expect(at.lat).toBeGreaterThanOrEqual(HUB.lat - 1e-12);
      expect(at.lat).toBeLessThanOrEqual(NORTH.lat + 1e-12);
      expect(at.lat).toBeGreaterThanOrEqual(prev - 1e-12);
      prev = at.lat;
    }
  });

  it("eases out — most of the distance covered early", () => {
    expect(easeOut(0)).toBe(0);
    expect(easeOut(1)).toBe(1);
    expect(easeOut(0.5)).toBeGreaterThan(0.5);
    // Clamped at both ends.
    expect(easeOut(-1)).toBe(0);
    expect(easeOut(2)).toBe(1);
  });
});

describe("pin markup", () => {
  it("draws a live rider solid and a stale one hollow with a warning", () => {
    const live = riderPinHtml(false);
    const stale = riderPinHtml(true);
    expect(live).toContain("ps-rider-pin-halo");
    expect(live).not.toContain("ps-rider-pin-stale");
    expect(stale).toContain("ps-rider-pin-stale");
    expect(stale).toContain("?");
  });

  it("escapes a self-entered area name in the door pin", () => {
    const html = doorPinHtml(`<img src=x onerror=alert(1)>`);
    expect(html).not.toContain("<img");
    expect(html).toContain("&#60;img");
  });
});
