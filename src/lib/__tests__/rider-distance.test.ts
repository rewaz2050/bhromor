import { describe, expect, it } from "vitest";
import { RIDER_KMH, riderDistance } from "@/lib/rider-distance";

const rider = { lat: 25.0658, lng: 91.395 };

describe("riderDistance — UX plan §7", () => {
  it("returns km, honest minutes at a city-bike pace and a localised label", () => {
    const away = riderDistance(rider, { lat: 25.0748, lng: 91.4 }, "en")!;
    expect(away.km).toBeGreaterThan(1);
    expect(away.km).toBeLessThan(1.5);
    expect(away.minutes).toBe(Math.max(1, Math.round((away.km / RIDER_KMH) * 60)));
    expect(away.distanceLabel).toMatch(/^1\.\d km$/);
    const bn = riderDistance(rider, { lat: 25.0748, lng: 91.4 }, "bn")!;
    expect(bn.distanceLabel).toMatch(/^[০-৯]\.[০-৯] কিমি$/);
  });

  it("rounds short hops to 50 m steps and never below one minute", () => {
    const near = riderDistance(rider, { lat: 25.0661, lng: 91.3952 }, "en")!;
    expect(near.distanceLabel).toMatch(/^\d+ m$/);
    expect(Number(near.distanceLabel.split(" ")[0]) % 50).toBe(0);
    expect(near.minutes).toBe(1);
  });

  it("stays silent without a real pin, a real fix, or with a stale far-away fix", () => {
    expect(riderDistance(null, { lat: 25, lng: 91 })).toBeNull();
    expect(riderDistance(rider, {})).toBeNull();
    expect(riderDistance(rider, { lat: 25, lng: undefined })).toBeNull();
    expect(riderDistance({ lat: Number.NaN, lng: 91 }, { lat: 25, lng: 91 })).toBeNull();
    expect(riderDistance(rider, { lat: 23.8, lng: 90.4 })).toBeNull(); // Dhaka: not a promise we can make
  });
});
