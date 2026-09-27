/** UX plan §3 (R11) — "আজ রাত ১১টায় শেষ": the wall-clock end of a flash window, in the shop's day. */
import { describe, expect, it } from "vitest";
import { bnClock, enClock, endsAtLabel } from "@/lib/ends-at";

// 2026-09-27 10:00 Asia/Dhaka (= 04:00Z)
const NOW = Date.UTC(2026, 8, 27, 4, 0, 0);
const dhaka = (y: number, m: number, d: number, h: number, min = 0) => Date.UTC(y, m - 1, d, h - 6, min, 0);

describe("endsAtLabel", () => {
  it("today, tonight at 11 — Bengali digits and part of day", () => {
    expect(endsAtLabel(dhaka(2026, 9, 27, 23), "bn", NOW)).toBe("আজ রাত ১১টায় শেষ");
    expect(endsAtLabel(dhaka(2026, 9, 27, 23), "en", NOW)).toBe("Ends today at 11 pm");
  });

  it("tomorrow, with minutes and other parts of the day", () => {
    expect(endsAtLabel(dhaka(2026, 9, 28, 18, 30), "bn", NOW)).toBe("আগামীকাল সন্ধ্যা ৬:৩০টায় শেষ");
    expect(endsAtLabel(dhaka(2026, 9, 28, 9), "en", NOW)).toBe("Ends tomorrow at 9 am");
  });

  it("further out shows the date; past or invalid → empty", () => {
    expect(endsAtLabel(dhaka(2026, 10, 3, 12), "bn", NOW)).toBe("৩ অক্টোবর দুপুর ১২টায় শেষ");
    expect(endsAtLabel(dhaka(2026, 10, 3, 0), "en", NOW)).toBe("Ends on 3 Oct at 12 am");
    expect(endsAtLabel(NOW - 1, "bn", NOW)).toBe("");
    expect(endsAtLabel(Number.NaN, "en", NOW)).toBe("");
  });

  it("clock helpers", () => {
    expect(bnClock(5, 0)).toBe("ভোর ৫টায়");
    expect(bnClock(13, 5)).toBe("দুপুর ১:০৫টায়");
    expect(bnClock(0, 0)).toBe("রাত ১২টায়");
    expect(enClock(0, 0)).toBe("12 am");
    expect(enClock(15, 45)).toBe("3:45 pm");
  });
});
