/**
 * B6 (2026-09-28) — a holiday a shop books in advance.
 *
 * The promise tested here is the one the shop relies on and cannot check:
 * it closes for 10–12 Oct and, on the 13th, it is open again WITHOUT anyone
 * pressing a switch. Everything else (the captions, the cap, the refusal to
 * backdate) protects that promise from being turned into a permanent closure
 * or a lie.
 */
import { describe, expect, it } from "vitest";
import {
  VACATION_MAX_DAYS,
  isOnVacation,
  validateVacation,
  vacationClosedLabel,
  vacationDaysLeft,
  vacationPhase,
  vacationRangeLabel,
  vacationReopenDate,
  vacationVendorLine,
} from "@/lib/shop-vacation";
import type { ShopVacation } from "@/lib/catalog";

const v = (start: string, end: string, note?: string): ShopVacation => ({
  start,
  end,
  note: note ?? "",
});

// 2026-09-28T12:00Z — a Monday noon, so "today" is 2026-09-28 everywhere below.
const NOW = Date.parse("2026-09-28T12:00:00Z");

describe("vacationPhase", () => {
  it("is 'none' when the shop has booked nothing", () => {
    expect(vacationPhase(undefined, NOW)).toBe("none");
    expect(vacationPhase(null, NOW)).toBe("none");
    expect(vacationPhase({ start: "", end: "", note: "" }, NOW)).toBe("none");
  });

  it("is 'scheduled' before the first day, 'active' inside, 'past' after the last", () => {
    const booked = v("2026-10-10", "2026-10-12");
    expect(vacationPhase(booked, Date.parse("2026-09-28T00:00:00Z"))).toBe("scheduled");
    expect(vacationPhase(booked, Date.parse("2026-10-09T23:59:00Z"))).toBe("scheduled");
    // Both ends are inclusive: the shop is away FROM the 10th.
    expect(vacationPhase(booked, Date.parse("2026-10-10T00:00:00Z"))).toBe("active");
    expect(vacationPhase(booked, Date.parse("2026-10-12T23:00:00Z"))).toBe("active");
    // …and back the very next day, on its own.
    expect(vacationPhase(booked, Date.parse("2026-10-13T00:00:00Z"))).toBe("past");
  });

  it("treats a single day as a holiday of one day", () => {
    const day = v("2026-10-10", "2026-10-10");
    expect(vacationPhase(day, Date.parse("2026-10-10T09:00:00Z"))).toBe("active");
    expect(vacationDaysLeft(day, Date.parse("2026-10-10T09:00:00Z"))).toBe(0);
  });

  it("ignores junk dates instead of closing the shop", () => {
    expect(vacationPhase(v("soon", "later"), NOW)).toBe("none");
    expect(isOnVacation(v("", "2026-10-12"), NOW)).toBe(false);
  });
});

describe("isOnVacation — the day the shop comes back", () => {
  it("is closed through the last day and open again the morning after", () => {
    const booked = v("2026-10-10", "2026-10-12");
    expect(isOnVacation(booked, Date.parse("2026-10-12T18:00:00Z"))).toBe(true);
    expect(isOnVacation(booked, Date.parse("2026-10-13T00:00:01Z"))).toBe(false);
  });

  it("counts the days still to run", () => {
    const booked = v("2026-10-10", "2026-10-12");
    expect(vacationDaysLeft(booked, Date.parse("2026-10-10T00:00:00Z"))).toBe(2);
    expect(vacationDaysLeft(booked, Date.parse("2026-10-11T00:00:00Z"))).toBe(1);
    expect(vacationDaysLeft(booked, Date.parse("2026-10-12T00:00:00Z"))).toBe(0);
    expect(vacationDaysLeft(booked, Date.parse("2026-10-13T00:00:00Z"))).toBe(0);
  });

  it("names the day orders open again — the date after the last holiday", () => {
    expect(vacationReopenDate(v("2026-10-10", "2026-10-12"), Date.parse("2026-10-11T00:00:00Z"))).toBe(
      "13 Oct",
    );
    // December: the reopening rolls into the next year.
    expect(vacationReopenDate(v("2026-12-30", "2026-12-31"), Date.parse("2026-12-31T00:00:00Z"))).toBe(
      "1 Jan",
    );
    expect(vacationReopenDate(v("2026-10-10", "2026-10-12"), Date.parse("2026-09-28T00:00:00Z"))).toBeNull();
  });
});

describe("the captions", () => {
  it("tells a shopper the day the shop is back, not just 'closed'", () => {
    expect(vacationClosedLabel(v("2026-10-10", "2026-10-12"), Date.parse("2026-10-10T00:00:00Z"))).toBe(
      "On holiday — back 13 Oct (2 days)",
    );
    expect(vacationClosedLabel(v("2026-10-10", "2026-10-12"), Date.parse("2026-10-11T00:00:00Z"))).toBe(
      "On holiday — back tomorrow (13 Oct)",
    );
    expect(vacationClosedLabel(v("2026-10-10", "2026-10-12"), Date.parse("2026-10-12T00:00:00Z"))).toBe(
      "On holiday — back 13 Oct",
    );
  });

  it("says nothing about a holiday when the shop is not on one", () => {
    expect(vacationClosedLabel(undefined, NOW)).toBeNull();
    expect(vacationClosedLabel(v("2026-10-10", "2026-10-12"), Date.parse("2026-09-28T00:00:00Z"))).toBeNull();
    // A holiday that has already passed is not news.
    expect(vacationClosedLabel(v("2026-09-01", "2026-09-03"), NOW)).toBeNull();
  });

  it("shows the range as the shop booked it", () => {
    expect(vacationRangeLabel(v("2026-10-10", "2026-10-12"))).toBe("10–12 Oct");
    expect(vacationRangeLabel(v("2026-10-10", "2026-10-10"))).toBe("10 Oct");
    expect(vacationRangeLabel(v("2026-10-30", "2026-11-02"))).toBe("30 Oct–2 Nov");
  });

  it("tells the vendor what is booked, and that the reopening is automatic", () => {
    const booked = v("2026-10-10", "2026-10-12");
    expect(vacationVendorLine(booked, Date.parse("2026-09-28T00:00:00Z"))).toBe(
      "Holiday booked: 10–12 Oct — starts in 12 days.",
    );
    expect(vacationVendorLine(booked, Date.parse("2026-10-10T00:00:00Z"))).toBe(
      "On holiday until 12 Oct — 2 days to go. Orders open again on 13 Oct, on their own.",
    );
    expect(vacationVendorLine(booked, Date.parse("2026-10-13T00:00:00Z"))).toContain("open again");
    expect(vacationVendorLine(undefined, NOW)).toContain("No holiday booked");
  });
});

describe("validateVacation", () => {
  it("accepts a normal holiday, keeping the note trimmed", () => {
    const out = validateVacation({ start: "2026-10-10", end: "2026-10-12", note: "  Eid  " }, "2026-09-28");
    expect(out.ok).toBe(true);
    expect(out.value).toEqual({ start: "2026-10-10", end: "2026-10-12", note: "Eid" });
  });

  it("accepts a holiday that starts today", () => {
    expect(validateVacation({ start: "2026-09-28", end: "2026-09-29" }, "2026-09-28").ok).toBe(true);
  });

  it("refuses a window that ends before it starts", () => {
    const out = validateVacation({ start: "2026-10-12", end: "2026-10-10" }, "2026-09-28");
    expect(out.ok).toBe(false);
    expect(out.errors.end).toMatch(/cannot end before/i);
  });

  it("refuses half a window — one date is not a holiday", () => {
    expect(validateVacation({ start: "2026-10-10", end: "" }, "2026-09-28").errors.end).toMatch(
      /pick the last day/i,
    );
    expect(validateVacation({ start: "", end: "2026-10-12" }, "2026-09-28").errors.start).toMatch(
      /pick the first day/i,
    );
  });

  it("refuses a holiday that is already over — you cannot close in the past", () => {
    const out = validateVacation({ start: "2026-08-01", end: "2026-08-05" }, "2026-09-28");
    expect(out.ok).toBe(false);
    expect(out.errors.end).toMatch(/already over/i);
  });

  it(`caps the window at ${VACATION_MAX_DAYS} days — an endless holiday is a permanent closure`, () => {
    const ok = validateVacation({ start: "2026-10-01", end: "2026-11-14" }, "2026-09-28");
    expect(ok.ok).toBe(true); // 45 days inclusive
    const over = validateVacation({ start: "2026-10-01", end: "2026-11-15" }, "2026-09-28");
    expect(over.ok).toBe(false);
    expect(over.errors.range).toMatch(/at most 45 days/i);
    expect(over.errors.range).toMatch(/close the shop instead/i);
  });

  it("refuses a note with no dates — copy about a window that was never given", () => {
    const out = validateVacation({ note: "Eid" }, "2026-09-28");
    expect(out.ok).toBe(false);
    expect(out.errors.start).toMatch(/pick the first day/i);
  });

  it("lets the shop clear its holiday with two empty dates", () => {
    const out = validateVacation({ start: "", end: "", note: "no longer" }, "2026-09-28");
    expect(out.ok).toBe(true);
    expect(out.value).toEqual({ start: null, end: null, note: "no longer" });
  });

  it("trims a long note rather than dropping it", () => {
    const out = validateVacation({ start: "", end: "", note: "x".repeat(400) }, "2026-09-28");
    expect(out.value.note).toHaveLength(160);
  });

  it("reads the vendor's own field names as well as the form's", () => {
    const out = validateVacation({ vacationStart: "2026-10-10", vacationEnd: "2026-10-12" }, "2026-09-28");
    expect(out.value).toMatchObject({ start: "2026-10-10", end: "2026-10-12" });
  });

  it("never throws on garbage — it answers with errors", () => {
    for (const raw of [null, undefined, 42, "nope", { start: 1, end: {} }]) {
      expect(() => validateVacation(raw, "2026-09-28")).not.toThrow();
      expect(validateVacation(raw, "2026-09-28").ok).toBe(false);
    }
  });
});
