/**
 * P0 #4 — the evening slot must reach the shop and the rider as a real
 * instant (Asia/Dhaka), and every surface must print the same label.
 */
import { describe, expect, it } from "vitest";
import {
  DHAKA_OFFSET_MS,
  deliverySlotLabel,
  deliverySlotSummary,
  dhakaDateAtHourMs,
  dhakaDateString,
  eveningScheduleIso,
  eveningSlotHint,
  formatDhakaDateTime,
} from "@/lib/delivery-slots";

/** Build an instant from Dhaka wall-clock parts. */
const dhaka = (y: number, m: number, d: number, h: number, min = 0) =>
  Date.UTC(y, m - 1, d, h, min) - DHAKA_OFFSET_MS;

describe("Dhaka calendar helpers", () => {
  it("dhakaDateString uses the Dhaka day, not UTC — 01:30 Dhaka is still 'today' there", () => {
    // 2026-09-18 01:30 Dhaka = 2026-09-17 19:30 UTC → toISOString().slice(0,10) would say the 17th.
    const ms = dhaka(2026, 9, 18, 1, 30);
    expect(new Date(ms).toISOString().slice(0, 10)).toBe("2026-09-17");
    expect(dhakaDateString(ms)).toBe("2026-09-18");
  });

  it("dhakaDateAtHourMs returns the instant of that wall-clock hour in Dhaka", () => {
    const ms = dhakaDateAtHourMs("2026-09-18", 18);
    expect(ms).toBe(Date.UTC(2026, 8, 18, 12)); // 18:00 +06 = 12:00Z
    expect(dhakaDateAtHourMs("2026-13-01", 18)).toBeNull();
    expect(dhakaDateAtHourMs("2026-02-30", 18)).toBeNull();
    expect(dhakaDateAtHourMs("garbage", 18)).toBeNull();
  });

  it("formatDhakaDateTime renders in Asia/Dhaka regardless of process TZ", () => {
    const label = formatDhakaDateTime(dhaka(2026, 9, 18, 18, 0));
    expect(label).toMatch(/18 Sep/);
    expect(label.toLowerCase()).toMatch(/6:00\s?pm/);
  });
});

describe("eveningScheduleIso", () => {
  it("before 18:00 Dhaka → today 18:00 Dhaka", () => {
    const now = dhaka(2026, 9, 18, 11, 15);
    expect(eveningScheduleIso(now)).toBe(new Date(dhaka(2026, 9, 18, 18)).toISOString());
    expect(eveningSlotHint(now, "bn")).toBe("আজ ৬–৯ PM");
    expect(eveningSlotHint(now, "en")).toBe("Today 6–9 PM");
  });

  it("during the window (18:00–21:00) → null (it IS evening; the window label still travels)", () => {
    const now = dhaka(2026, 9, 18, 19, 30);
    expect(eveningScheduleIso(now)).toBeNull();
    expect(eveningSlotHint(now, "bn")).toMatch(/এখনই/);
  });

  it("after 21:00 Dhaka → tomorrow 18:00 Dhaka (crossing a month end correctly)", () => {
    const now = dhaka(2026, 9, 30, 22, 5);
    expect(eveningScheduleIso(now)).toBe(new Date(dhaka(2026, 10, 1, 18)).toISOString());
    expect(eveningSlotHint(now, "en")).toBe("Tomorrow 6–9 PM");
  });

  it("23:30 Dhaka on the 17th is still 'the 17th' for the rollover (UTC would say the 17th too, 01:00 Dhaka would not)", () => {
    // 00:30 Dhaka on the 18th = 18:30Z on the 17th — before 18:00 Dhaka → today (18th) 18:00.
    const now = dhaka(2026, 9, 18, 0, 30);
    expect(eveningScheduleIso(now)).toBe(new Date(dhaka(2026, 9, 18, 18)).toISOString());
  });
});

describe("deliverySlotSummary — one label for admin, rider, receipt and /track", () => {
  it("evening order with a scheduled instant", () => {
    const at = dhaka(2026, 9, 18, 18);
    expect(deliverySlotSummary({ deliveryWindow: "evening", scheduledAt: at }, "en")).toMatch(
      /^Evening \(6–9 PM\) · 18 Sep/,
    );
    expect(deliverySlotSummary({ deliveryWindow: "evening", scheduledAt: at }, "bn")).toMatch(
      /^সন্ধ্যায় \(৬–৯ PM\) · 18 Sep/,
    );
  });

  it("evening order placed DURING the window (no scheduled_at) still says evening", () => {
    expect(deliverySlotSummary({ deliveryWindow: "evening" }, "en")).toBe("Evening (6–9 PM)");
  });

  it("'now' orders stay quiet so lists do not fill with badges", () => {
    expect(deliverySlotSummary({ deliveryWindow: "now" }, "en")).toBeNull();
    expect(deliverySlotSummary({}, "en")).toBeNull();
    expect(deliverySlotSummary({ deliveryWindow: null, scheduledAt: null }, "bn")).toBeNull();
  });

  it("pickup orders print the pickup slot, not a delivery window", () => {
    expect(deliverySlotSummary({ isPickup: true, pickupSlot: "4-6" }, "en")).toBe("Pickup · 4–6 PM");
    expect(deliverySlotSummary({ isPickup: true, pickupSlot: "now" }, "en")).toBeNull();
  });

  it("unknown window keys echo back instead of vanishing", () => {
    expect(deliverySlotLabel("weird-slot", "en")).toBe("weird-slot");
    expect(deliverySlotLabel(null)).toBeNull();
  });
});
