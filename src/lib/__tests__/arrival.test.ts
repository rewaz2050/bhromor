import { describe, expect, it } from "vitest";
import { arrivalCue, bnDigits, clockLabel } from "@/lib/arrival";
import { COURIER_ZONE_ID } from "@/lib/delivery";
import { DHAKA_OFFSET_MS } from "@/lib/delivery-slots";

/** ms for a Dhaka wall-clock time on 2026-09-20. */
const dhaka = (hour: number, minute = 0) =>
  Date.UTC(2026, 8, 20, hour, minute) - DHAKA_OFFSET_MS;

describe("arrival cue", () => {
  it("prints a Dhaka clock time, Bangla digits in Bangla", () => {
    expect(clockLabel(dhaka(19, 5), "en")).toBe("7:05 PM");
    expect(clockLabel(dhaka(0, 30), "en")).toBe("12:30 AM");
    expect(clockLabel(dhaka(12, 0), "bn")).toBe("১২:০০ PM");
    expect(bnDigits("45-50")).toBe("৪৫-৫০");
  });

  it("promises the upper end of the checkout's ETA, rounded up, never earlier", () => {
    const now = dhaka(15, 0); // afternoon, no rush/night allowance
    const cue = arrivalCue({ zoneId: "z1", shopPrepMinutes: 15, lang: "en" }, now);
    expect(cue).not.toBeNull();
    // dynamicEta: 35 + 15 = 50 → label 45–55 → 55 min
    expect(cue!.minutes).toBe(55);
    expect(cue!.timeLabel).toBe("3:55 PM");
    expect(cue!.text).toBe("Order now — at your door by about 3:55 PM today");
    expect(cue!.kind).toBe("instant");
  });

  it("says night delivery (with the surcharge) after 9PM and drops 'today' past midnight", () => {
    const cue = arrivalCue({ zoneId: null, lang: "en" }, dhaka(23, 30));
    expect(cue!.kind).toBe("night");
    expect(cue!.crossesMidnight).toBe(true);
    expect(cue!.text).toMatch(/night delivery \+৳20/);
    expect(cue!.text).not.toMatch(/today/);
    const bn = arrivalCue({ zoneId: null, lang: "bn" }, dhaka(10, 0));
    expect(bn!.text).toBe("এখন অর্ডার করলে আজ আনুমানিক ১০:৫৫ AM-এর মধ্যে আপনার দরজায়");
  });

  it("never promises a clock time to the courier zone", () => {
    expect(arrivalCue({ zoneId: COURIER_ZONE_ID }, dhaka(12))).toBeNull();
  });
});
