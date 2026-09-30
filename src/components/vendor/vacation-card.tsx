"use client";

/**
 * B6 (2026-09-28) — the shop books its own holiday.
 *
 * The whole point is the thing the shop does NOT have to do: remember to
 * reopen. It picks the first and last day; the storefront shows it as closed
 * for those days (with the date it takes orders again), orders cannot be placed
 * in that window, and when the last day passes the shop is open again by
 * itself. The card says all three out loud, because a shop that does not trust
 * the reopening will just close manually and forget to come back.
 *
 * Presentational + plain props: the page supplies the hook's save, so the
 * wording and the rules are testable without a network.
 */

import { useState } from "react";
import {
  VACATION_MAX_DAYS,
  VACATION_NOTE_MAX,
  validateVacation,
  vacationPhase,
  vacationVendorLine,
} from "@/lib/shop-vacation";
import type { ShopVacation } from "@/lib/catalog";

const today = (): string => new Date().toISOString().slice(0, 10);

export default function VacationCard({
  vacation,
  onSave,
  editable = true,
}: {
  vacation?: ShopVacation | null;
  onSave: (patch: {
    start: string | null;
    end: string | null;
    note: string;
  }) => Promise<void>;
  /** B6 — a staff login may not stop the shop's sales for days: owner only. */
  editable?: boolean;
}) {
  const [start, setStart] = useState(vacation?.start ?? "");
  const [end, setEnd] = useState(vacation?.end ?? "");
  const [note, setNote] = useState(vacation?.note ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const checked = validateVacation({ start, end, note });
  const phase = vacationPhase(vacation);
  const booked = phase === "active" || phase === "scheduled";

  const submit = async () => {
    if (!checked.ok) {
      setError(Object.values(checked.errors)[0] ?? "Check the dates.");
      return;
    }
    setSaving(true);
    setError(null);
    setSaved(null);
    try {
      await onSave(checked.value);
      setSaved(
        checked.value.start
          ? "Holiday booked — your shop closes on those days and opens again by itself."
          : "Holiday cleared — your shop takes orders as usual.",
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not save — try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  const clear = () => {
    setStart("");
    setEnd("");
    setNote("");
    if (error) setError(null);
    if (saved) setSaved(null);
  };

  return (
    <section
      aria-label="Holiday dates"
      className="rounded-2xl bg-paper p-5 ring-1 ring-line"
      data-testid="vacation-card"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-ink-soft">
          Holiday dates
        </h3>
        <span
          data-testid="vacation-state"
          className={`rounded-full px-3 py-1 text-[0.62rem] font-bold uppercase tracking-wide ${
            phase === "active"
              ? "bg-amber-100 text-amber-900"
              : phase === "scheduled"
                ? "bg-sky-100 text-sky-900"
                : "bg-ivory-200 text-ink-soft"
          }`}
        >
          {phase === "active"
            ? "On holiday"
            : phase === "scheduled"
              ? "Booked"
              : "No holiday"}
        </span>
      </div>

      <p
        className="mt-3 text-sm leading-6 text-ink"
        data-testid="vacation-line"
      >
        {vacationVendorLine(vacation)}
      </p>

      <p className="mt-2 text-[0.68rem] leading-5 text-ink-soft">
        While the holiday runs your shop shows as closed with the date you are
        back, and no order can be placed. When the last day is over you are open
        again on your own — nothing to switch back on.
      </p>

      {/* B6 — a staff login sees the holiday but cannot book one: it stops the
          shop's own sales for days, which is the owner's call (C1 makes staff
          accounts common, so this stops being a rare case). */}
      {!editable ? (
        <p
          data-testid="vacation-readonly"
          className="mt-4 text-xs leading-5 text-ink-soft"
        >
          Only the shop owner can book or cancel a holiday.
        </p>
      ) : (
        <>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs font-medium text-ink-soft">
                First day closed
              </span>
              <input
                type="date"
                value={start}
                min={today()}
                onChange={(e) => {
                  setStart(e.target.value);
                  setError(null);
                  setSaved(null);
                }}
                data-testid="vacation-start"
                className="mt-1 w-full rounded-xl bg-paper px-3 py-2 text-sm ring-1 ring-line focus:ring-2 focus:ring-forest-500"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-ink-soft">
                Last day closed
              </span>
              <input
                type="date"
                value={end}
                min={start || today()}
                onChange={(e) => {
                  setEnd(e.target.value);
                  setError(null);
                  setSaved(null);
                }}
                data-testid="vacation-end"
                className="mt-1 w-full rounded-xl bg-paper px-3 py-2 text-sm ring-1 ring-line focus:ring-2 focus:ring-forest-500"
              />
            </label>
            <label className="block sm:col-span-2">
              <span className="text-xs font-medium text-ink-soft">
                Note for shoppers (optional) — e.g. “Closed for Eid, back on the
                13th”
              </span>
              <input
                value={note}
                onChange={(e) => {
                  setNote(e.target.value.slice(0, VACATION_NOTE_MAX));
                  setError(null);
                  setSaved(null);
                }}
                placeholder="Closed for Eid"
                data-testid="vacation-note"
                className="mt-1 w-full rounded-xl bg-paper px-3 py-2 text-sm ring-1 ring-line focus:ring-2 focus:ring-forest-500"
              />
            </label>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void submit()}
              disabled={saving || !checked.ok}
              data-testid="vacation-save"
              className="rounded-full bg-forest-800 px-5 py-2 text-xs font-semibold text-ivory-50 hover:bg-forest-700 disabled:opacity-40"
            >
              {saving ? "Saving…" : booked ? "Change holiday" : "Book holiday"}
            </button>
            {booked && (
              <button
                type="button"
                onClick={clear}
                data-testid="vacation-clear"
                className="text-xs font-semibold text-forest-800 underline underline-offset-2"
              >
                Cancel holiday (opens my shop again)
              </button>
            )}
            {!checked.ok && (
              <span
                className="text-xs text-ink-soft"
                data-testid="vacation-hint"
              >
                {Object.values(checked.errors)[0]}
              </span>
            )}
            {saved && (
              <span
                role="status"
                className="text-xs font-medium text-forest-800"
              >
                {saved}
              </span>
            )}
            {error && (
              <span role="alert" className="text-xs font-medium text-red-700">
                {error}
              </span>
            )}
          </div>

          <p className="mt-2 text-[0.62rem] text-ink-soft">
            At most {VACATION_MAX_DAYS} days — for a longer closure, close the
            shop from the Open switch instead.
          </p>
        </>
      )}
    </section>
  );
}
