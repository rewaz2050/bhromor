import { describe, expect, it } from "vitest";
import {
  ORDER_BONUS_DEFAULTS,
  anyOrderBonusOn,
  inPeakWindow,
  orderBonusMessage,
  parseOrderBonusInput,
  peakBonusOn,
  peakWindowLabel,
  rainBonusOn,
  sanitizeOrderBonusSettings,
} from "../rider-order-bonus";

describe("order bonus switches", () => {
  it("is off by default", () => {
    expect(anyOrderBonusOn(ORDER_BONUS_DEFAULTS)).toBe(false);
  });
  it("peak needs an amount AND a real window; rain needs an amount", () => {
    expect(peakBonusOn({ ...ORDER_BONUS_DEFAULTS, peakBonus: 3000 })).toBe(true);
    expect(peakBonusOn({ ...ORDER_BONUS_DEFAULTS, peakBonus: 3000, peakStartHour: 5, peakEndHour: 5 })).toBe(false);
    expect(peakBonusOn({ ...ORDER_BONUS_DEFAULTS, peakStartHour: 18 })).toBe(false);
    expect(rainBonusOn({ ...ORDER_BONUS_DEFAULTS, rainBonus: 1 })).toBe(true);
    expect(anyOrderBonusOn({ ...ORDER_BONUS_DEFAULTS, rainBonus: 1 })).toBe(true);
  });
});

describe("inPeakWindow (mirrors ps_award_order_bonuses)", () => {
  const day = { peakStartHour: 18, peakEndHour: 22 };
  it("start inclusive, end exclusive", () => {
    expect([17, 18, 21, 22].map((h) => inPeakWindow(h, day))).toEqual([false, true, true, false]);
  });
  it("wraps midnight when start > end", () => {
    const night = { peakStartHour: 22, peakEndHour: 2 };
    expect([21, 22, 23, 0, 1, 2, 12].map((h) => inPeakWindow(h, night))).toEqual([false, true, true, true, true, false, false]);
  });
  it("start = end is no window, not all day", () => {
    expect([0, 5, 23].some((h) => inPeakWindow(h, { peakStartHour: 5, peakEndHour: 5 }))).toBe(false);
  });
  it("labels the window", () => {
    expect(peakWindowLabel(day)).toBe("18:00–22:00");
    expect(peakWindowLabel({ peakStartHour: 5, peakEndHour: 9 })).toBe("05:00–09:00");
  });
});

describe("sanitizeOrderBonusSettings", () => {
  it("falls back per field and clamps", () => {
    expect(sanitizeOrderBonusSettings(null)).toEqual(ORDER_BONUS_DEFAULTS);
    expect(sanitizeOrderBonusSettings({ peakBonus: 999999, peakStartHour: 40, peakEndHour: "x", rainBonus: -5 })).toEqual({
      peakBonus: 20000, peakStartHour: 23, peakEndHour: 22, rainBonus: 0,
    });
  });
});

describe("parseOrderBonusInput", () => {
  const ok = { peakBonusTaka: "30", peakStartHour: "18", peakEndHour: "22", rainBonusTaka: "20" };
  it("converts taka to paisa", () => {
    const r = parseOrderBonusInput(ok);
    expect(r.ok && r.settings).toEqual({ peakBonus: 3000, peakStartHour: 18, peakEndHour: 22, rainBonus: 2000 });
  });
  it("empty means off", () => {
    const r = parseOrderBonusInput({});
    expect(r.ok && r.settings).toEqual(ORDER_BONUS_DEFAULTS);
  });
  it("refuses a bonus above ৳200, junk hours, and a zero-length window with a peak bonus", () => {
    const bad: [Record<string, unknown>, RegExp][] = [
      [{ ...ok, peakBonusTaka: "201" }, /Peak-hour bonus/],
      [{ ...ok, rainBonusTaka: "-1" }, /Rainy-day bonus/],
      [{ ...ok, rainBonusTaka: "abc" }, /Rainy-day bonus/],
      [{ ...ok, peakStartHour: "24" }, /start/],
      [{ ...ok, peakEndHour: "1.5" }, /end/],
      [{ ...ok, peakStartHour: "9", peakEndHour: "9" }, /different start and end/],
    ];
    for (const [input, re] of bad) {
      const r = parseOrderBonusInput(input);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toMatch(re);
    }
  });
  it("an equal window is fine while the peak bonus is off", () => {
    expect(parseOrderBonusInput({ ...ok, peakBonusTaka: "0", peakStartHour: "9", peakEndHour: "9" }).ok).toBe(true);
  });
});

describe("orderBonusMessage", () => {
  it("names the kind, the count and the total", () => {
    expect(orderBonusMessage("peak_bonus", 3, 9000)).toEqual({ title: "⚡ পিক আওয়ার বোনাস!", body: "3টি ডেলিভারির জন্য ৳90 আপনার ওয়ালেটে যোগ হয়েছে।" });
    expect(orderBonusMessage("rain_bonus", 1, 2000).title).toMatch(/বৃষ্টি/);
  });
});
