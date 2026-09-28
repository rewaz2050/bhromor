/**
 * B6 (2026-09-28) — the shop's holiday dates.
 *
 * A holiday is the one closure a shop can plan: Eid, a wedding, a stock trip.
 * Everything about it is DERIVED from two dates, which is what makes the
 * promise hold — the shop closes when the window opens and reopens when it
 * ends, with nothing to run and nothing to remember.
 *
 * Two rules keep it honest:
 *   • the window is bounded (at most `VACATION_MAX_DAYS`) — an endless
 *     "holiday" is a permanent closure pretending to be a date range;
 *   • a holiday never overwrites the shop's own daily switch. While the window
 *     runs the shop is closed; the day after, it is exactly as the shop left
 *     itself. (The database clears a window that has already passed, so no
 *     screen has to explain a holiday from last month.)
 *
 * Pure: the clock is a parameter, dates are plain YYYY-MM-DD strings.
 */

import type { ShopVacation } from "./catalog";

/** Longest a shop may close for (mirrors ps_vacation_max_days()). */
export const VACATION_MAX_DAYS = 45;

const DAY_MS = 86_400_000;
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Midnight UTC of a YYYY-MM-DD string — the same day everywhere, no drift. */
export const vacationDateMs = (date: string): number => {
  const ms = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(ms) ? ms : Number.NaN;
};

export const toVacationDate = (ms: number): string =>
  new Date(ms).toISOString().slice(0, 10);

/** Today, as a vacation date, in the shopper's own day (UTC keeps it stable). */
export const todayVacationDate = (now: number = Date.now()): string => toVacationDate(now);

export type VacationPhase = "none" | "scheduled" | "active" | "past";

export const vacationPhase = (
  v: ShopVacation | undefined | null,
  now: number = Date.now(),
): VacationPhase => {
  if (!v?.start || !v.end) return "none";
  const today = vacationDateMs(todayVacationDate(now));
  const start = vacationDateMs(v.start);
  const end = vacationDateMs(v.end);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return "none";
  if (today > end) return "past";
  if (today < start) return "scheduled";
  return "active";
};

/** Closed for the holiday right now. */
export const isOnVacation = (v: ShopVacation | undefined | null, now: number = Date.now()): boolean =>
  vacationPhase(v, now) === "active";

/** Whole days the holiday still has to run (0 on its last day). */
export const vacationDaysLeft = (
  v: ShopVacation | undefined | null,
  now: number = Date.now(),
): number => {
  if (vacationPhase(v, now) !== "active") return 0;
  const end = vacationDateMs(v?.end ?? "");
  const today = vacationDateMs(todayVacationDate(now));
  return Math.max(0, Math.round((end - today) / DAY_MS));
};

const parts = (date: string): { day: number; month: string } => {
  const d = new Date(`${date}T00:00:00Z`);
  return {
    day: d.getUTCDate(),
    month: d.toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" }),
  };
};

const pretty = (date: string): string => {
  const { day, month } = parts(date);
  return `${day} ${month}`;
};

/**
 * "10–12 Oct" for a holiday inside one month, "30 Oct–2 Nov" across two, and
 * "10 Oct" for a single day — the shop reads its own booking back at a glance.
 */
export const vacationRangeLabel = (v: ShopVacation): string => {
  const end = v.end ?? v.start;
  if (v.start === end) return pretty(v.start);
  const a = parts(v.start);
  const b = parts(end);
  return a.month === b.month ? `${a.day}–${b.day} ${a.month}` : `${pretty(v.start)}–${pretty(end)}`;
};

/** The day the shop takes orders again, or null when it is not away. */
export const vacationReopenDate = (
  v: ShopVacation | undefined | null,
  now: number = Date.now(),
): string | null =>
  isOnVacation(v, now) ? pretty(toVacationDate(vacationDateMs(v?.end ?? "") + DAY_MS)) : null;

/**
 * What a shopper is told instead of a bare "Closed": the shop is away and
 * takes orders again on a date.
 */
export const vacationClosedLabel = (
  v: ShopVacation | undefined | null,
  now: number = Date.now(),
): string | null => {
  if (!isOnVacation(v, now)) return null;
  const left = vacationDaysLeft(v, now);
  const reopens = pretty(toVacationDate(vacationDateMs(v?.end ?? "") + DAY_MS));
  if (left <= 0) return `On holiday — back ${reopens}`;
  if (left === 1) return `On holiday — back tomorrow (${reopens})`;
  return `On holiday — back ${reopens} (${left} days)`;
};

/** The vendor's own line: what is booked, or what is running. */
export const vacationVendorLine = (
  v: ShopVacation | undefined | null,
  now: number = Date.now(),
): string => {
  const phase = vacationPhase(v, now);
  if (phase === "none" || !v?.start || !v?.end) {
    return "No holiday booked — your shop takes orders whenever you open it.";
  }
  const range = vacationRangeLabel(v);
  if (phase === "active") {
    const left = vacationDaysLeft(v, now);
    return `On holiday until ${pretty(v.end)} — ${left === 0 ? "last day" : `${left} day${left === 1 ? "" : "s"} to go`}. Orders open again on ${pretty(
      toVacationDate(vacationDateMs(v.end) + DAY_MS),
    )}, on their own.`;
  }
  if (phase === "scheduled") {
    const days = Math.max(1, Math.round((vacationDateMs(v.start) - vacationDateMs(todayVacationDate(now))) / DAY_MS));
    return `Holiday booked: ${range} — starts in ${days} day${days === 1 ? "" : "s"}.`;
  }
  return `Holiday (${range}) has ended — you are open again.`;
};

/* ------------------------------------------------------------------ */
/* The form                                                            */
/* ------------------------------------------------------------------ */

export interface VacationPatch {
  /** YYYY-MM-DD, or null to clear the holiday. */
  start: string | null;
  end: string | null;
  note: string;
}

export const VACATION_NOTE_MAX = 160;

export interface VacationValidation {
  ok: boolean;
  errors: Partial<Record<"start" | "end" | "note" | "range", string>>;
  value: VacationPatch;
}

/**
 * What the vendor typed → what the database may store. `today` is the shop's
 * own day, so a holiday booked "for tomorrow" is tomorrow where they are.
 */
export const validateVacation = (
  raw: unknown,
  today: string = todayVacationDate(),
): VacationValidation => {
  const errors: VacationValidation["errors"] = {};
  // Not an object at all: there are no dates to read, so nothing to book.
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return {
      ok: false,
      errors: { range: "Send the holiday as a first and last day." },
      value: { start: null, end: null, note: "" },
    };
  }
  const b = raw as Record<string, unknown>;
  const str = (v: unknown): string => (typeof v === "string" ? v.trim().slice(0, 10) : "");
  /** A box the caller actually filled in (a junk value counts as filled). */
  const sent = (v: unknown): boolean =>
    v !== undefined && v !== null && !(typeof v === "string" && v.trim() === "");

  const rawStart = b.start ?? b.vacationStart;
  const rawEnd = b.end ?? b.vacationEnd;
  const start = str(rawStart);
  const end = str(rawEnd);
  const note = String(b.note ?? b.vacationNote ?? "").trim().slice(0, VACATION_NOTE_MAX);

  // Clearing is allowed: sending no dates (or two empty ones) means "no holiday".
  // A box that WAS filled in but holds no real date is an error, not a clear —
  // otherwise `vacationStart: 123` would silently wipe a booked holiday.
  const clearing = start === "" && end === "" && !sent(rawStart) && !sent(rawEnd);
  // A note with no dates at all is a half-booking: the copy is ABOUT a window
  // the shop never gave, so it is refused rather than filed under nothing.
  if (clearing && note !== "" && rawStart === undefined && rawEnd === undefined) {
    errors.start = "Pick the first day of the holiday.";
  }
  if (!clearing) {
    if (!DATE_RE.test(start)) errors.start = "Pick the first day of the holiday.";
    if (!DATE_RE.test(end)) errors.end = "Pick the last day of the holiday.";
    if (!errors.start && !errors.end) {
      if (end < start) {
        errors.end = "The holiday cannot end before it starts.";
      } else {
        const days = Math.round((vacationDateMs(end) - vacationDateMs(start)) / DAY_MS) + 1;
        if (days > VACATION_MAX_DAYS) {
          errors.range = `A holiday can be at most ${VACATION_MAX_DAYS} days — for longer, close the shop instead.`;
        }
        if (end < today) {
          errors.end = "That holiday is already over — pick a day that is still coming.";
        }
      }
    }
  }

  return {
    ok: Object.keys(errors).length === 0,
    errors,
    value: clearing ? { start: null, end: null, note } : { start, end, note },
  };
};
