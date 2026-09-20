import { describe, expect, it } from "vitest";
import { codEstimate } from "@/lib/cod-estimate";
import { DHAKA_OFFSET_MS } from "@/lib/delivery-slots";

const dhaka = (hour: number) => Date.UTC(2026, 8, 20, hour) - DHAKA_OFFSET_MS;

describe("codEstimate — cash to keep at the door", () => {
  it("is exact once the zone is known: subtotal + that zone's charge", () => {
    const est = codEstimate({ subtotal: 189000, zoneId: "z2" }, dhaka(15));
    expect(est.exact).toBe(true);
    expect(est.min).toBe(189000 + 12000);
    expect(est.max).toBe(est.min);
    expect(est.night).toBe(0);
  });

  it("gives the ৳60–150 range when no zone has been chosen yet", () => {
    const est = codEstimate({ subtotal: 100000, zoneId: null }, dhaka(15));
    expect(est.exact).toBe(false);
    expect([est.min, est.max]).toEqual([106000, 115000]);
  });

  it("adds the ৳20 night surcharge between 9PM and 6AM Dhaka time", () => {
    expect(codEstimate({ subtotal: 100000, zoneId: "z1" }, dhaka(22)).min).toBe(100000 + 6000 + 2000);
    expect(codEstimate({ subtotal: 100000, zoneId: "z1" }, dhaka(5)).night).toBe(2000);
    expect(codEstimate({ subtotal: 100000, zoneId: "z1" }, dhaka(6)).night).toBe(0);
  });

  it("flags a courier basket under the ৳500 floor", () => {
    expect(codEstimate({ subtotal: 45000, zoneId: "z4" }, dhaka(12)).belowCourierMinimum).toBe(true);
    expect(codEstimate({ subtotal: 50000, zoneId: "z4" }, dhaka(12)).belowCourierMinimum).toBe(false);
    expect(codEstimate({ subtotal: 45000, zoneId: "z1" }, dhaka(12)).belowCourierMinimum).toBe(false);
  });
});
