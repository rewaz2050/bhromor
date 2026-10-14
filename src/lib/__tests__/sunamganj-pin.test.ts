/**
 * The pin → address path the checkout leans on (2026-10-09).
 *
 * A shopper drops a pin; the map knows the zone to a few metres but Sunamganj
 * Sadar has no parcel-level address data anywhere, so the pin's honest job is
 * to take the 27-para list down to that zone's own 8-9. These pin the numbers
 * down: the distance rings, which paras each ring owns, and that a pin never
 * invents a para the zone table does not know.
 */

import { describe, expect, it } from "vitest";
import {
  SADAR_PARA_OPTIONS,
  SUNAMGANJ_HUB_COORDS,
  SUNAMGANJ_ZONES,
  distanceFromHubKm,
  findZoneByDistance,
  parasForZone,
  zoneById,
} from "../sunamganj";

/** Metres north/east of Traffic Point → lat/lng (1° lat ≈ 111.32 km). */
const offset = (northM: number, eastM: number) => ({
  lat: SUNAMGANJ_HUB_COORDS.lat + northM / 111_320,
  lng: SUNAMGANJ_HUB_COORDS.lng + eastM / 110_000,
});

describe("parasForZone — what a pin can narrow the choice to", () => {
  it("returns exactly that zone's areas, in order", () => {
    expect(parasForZone("z1")).toEqual(SUNAMGANJ_ZONES[0].areas);
    expect(parasForZone("z2")).toEqual(SUNAMGANJ_ZONES[1].areas);
    expect(parasForZone("z3")).toEqual(SUNAMGANJ_ZONES[2].areas);
  });

  it("never mixes zones, and never exceeds the Sadar list", () => {
    const a = parasForZone("z1");
    const b = parasForZone("z2");
    expect(a.some((p) => b.includes(p))).toBe(false);
    for (const name of [...a, ...b]) {
      expect(SADAR_PARA_OPTIONS.some((p) => p.name === name)).toBe(true);
    }
  });

  it("an unknown zone narrows to nothing rather than guessing", () => {
    expect(parasForZone("z9")).toEqual([]);
    expect(parasForZone("")).toEqual([]);
  });

  it("the courier zone (z4) has areas to show but none of them are Sadar picks", () => {
    // z4 is "somewhere else" — its areas are courier labels, so a pin there
    // narrows the list but every option is still one the shopper confirms.
    expect(parasForZone("z4").length).toBeGreaterThan(0);
    expect(SADAR_PARA_OPTIONS.some((p) => p.zoneId === "z4")).toBe(false);
  });
});

describe("zoneById — labelling the pin with its own answer", () => {
  it("names the zone the pin actually fell in", () => {
    expect(zoneById("z1")?.name).toBe(SUNAMGANJ_ZONES[0].name);
    expect(zoneById("nope")).toBeNull();
  });
});

describe("findZoneByDistance — the rings around Traffic Point", () => {
  it("reads the rings as 1.5 / 2.5 / 4 km", () => {
    expect(findZoneByDistance(offset(0, 0)).id).toBe("z1");
    expect(findZoneByDistance(offset(1_000, 0)).id).toBe("z1");
    expect(findZoneByDistance(offset(2_000, 0)).id).toBe("z2");
    expect(findZoneByDistance(offset(3_000, 0)).id).toBe("z3");
    expect(findZoneByDistance(offset(9_000, 0)).id).toBe("z4");
  });

  it("measures the hub as zero", () => {
    expect(distanceFromHubKm(SUNAMGANJ_HUB_COORDS)).toBeCloseTo(0, 6);
  });

  it("a pin and its zone agree, which is what the chips are built on", () => {
    const pin = offset(1_200, 300);
    const zone = findZoneByDistance(pin);
    expect(parasForZone(zone.id)).toEqual(zoneById(zone.id)?.areas);
    expect(parasForZone(zone.id).length).toBeGreaterThan(0);
  });
});
