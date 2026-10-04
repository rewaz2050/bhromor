"use client";

/**
 * The rider's own shift (P2 #22). Auto-dispatch only offers jobs inside it
 * (enforced in the database, not just here), so this card is real scheduling,
 * not decoration. Lives on the Profile tab.
 */

import { useEffect, useMemo, useState } from "react";
import { IconMapPin } from "@/components/ui/icons";
import { availabilityLabel, isOnShift, type RiderAvailability } from "@/lib/rider-hours";

const SHIFT_DAYS = ["শু", "ম", "বু", "বৃ", "শু", "শ", "ছ"] as const;
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

export function RiderShiftCard({
  rider,
  onSave,
  flash,
}: {
  rider: import("@/lib/catalog").Rider | null;
  onSave: (payload: { fromHour: number | null; toHour: number | null; days: number[] }) => Promise<string | null>;
  flash: (msg: string) => void;
}) {
  const availFromHour = rider?.availability?.fromHour ?? null;
  const availToHour = rider?.availability?.toHour ?? null;
  const availDaysKey = JSON.stringify(rider?.availability?.days ?? null);
  // Rebuilt from the three primitives so the effect below can depend on
  // stable values (a fresh object every render would re-arm the interval).
  const avail = useMemo<RiderAvailability>(
    () => ({
      fromHour: availFromHour,
      toHour: availToHour,
      days: JSON.parse(availDaysKey) as number[] | null,
    }),
    [availFromHour, availToHour, availDaysKey],
  );
  const [from, setFrom] = useState<string>(avail.fromHour === null ? "" : String(avail.fromHour));
  const [to, setTo] = useState<string>(avail.toHour === null ? "" : String(avail.toHour));
  const [days, setDays] = useState<number[]>(avail.days ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // "on shift right now?" is wall-clock — computed after mount, never during
  // render, and refreshed once a minute so the badge cannot lie for long.
  const [onShift, setOnShift] = useState<boolean | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- clock badge
    setOnShift(isOnShift(avail, Date.now()));
    const id = window.setInterval(() => setOnShift(isOnShift(avail, Date.now())), 60_000);
    return () => window.clearInterval(id);
  }, [avail]);

  const dirty =
    from !== (avail.fromHour === null ? "" : String(avail.fromHour)) ||
    to !== (avail.toHour === null ? "" : String(avail.toHour)) ||
    JSON.stringify([...days].sort()) !== JSON.stringify([...(avail.days ?? [])].sort());

  const save = async () => {
    setSaving(true);
    setError(null);
    const err = await onSave({
      fromHour: from === "" ? null : Number(from),
      toHour: to === "" ? null : Number(to),
      days: [...days].sort((a, b) => a - b),
    });
    setSaving(false);
    if (err) setError(err);
    else flash("শিফট সেভ হয়েছে — এখন থেকে অফার এই ঘরেই আসবে");
  };

  return (
    <section
      aria-label="Shift settings"
      className="rounded-2xl border border-line bg-ivory-100/70 p-4 shadow-sm"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <IconMapPin className="h-4 w-4 text-forest-700" />
          <span className="text-xs font-bold uppercase tracking-wider text-forest-900">
            আমার শিফট (Gig hours)
          </span>
        </div>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
            onShift === null
              ? "bg-gray-200 text-gray-600"
              : onShift
                ? "bg-emerald-100 text-emerald-800"
                : "bg-amber-100 text-amber-800"
          }`}
        >
          {onShift === null ? "…" : onShift ? "Shift-এ আছেন" : "Shift-এর বাইরে"}
        </span>
      </div>
      <p className="mt-1.5 text-[11px] leading-5 text-ink-soft">
        নতুন অর্ডারের অফার শুধু এই সময়ের মধ্যেই আসবে — বাইরে থাকলে অ্যাপ খোলা থাকলেও আসবে না।{" "}
        <span className="whitespace-nowrap font-semibold">{availabilityLabel({ fromHour: from === "" ? null : Number(from), toHour: to === "" ? null : Number(to), days: days.length > 0 ? days : null })}</span>
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        <label className="flex items-center gap-1.5">
          <span className="text-ink-soft">থেকে</span>
          <select
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="h-9 rounded-lg border border-line bg-white px-2"
            aria-label="Shift start hour (Dhaka)"
          >
            <option value="">যেকোনো সময় — Any</option>
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={String(h)}>
                {String(h).padStart(2, "0")}:00
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5">
          <span className="text-ink-soft">পর্যন্ত</span>
          <select
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="h-9 rounded-lg border border-line bg-white px-2"
            aria-label="Shift end hour (Dhaka)"
          >
            <option value="">সারারাত — Any</option>
            {Array.from({ length: 25 }, (_, h) => h).slice(1).map((h) => (
              <option key={h} value={String(h)}>
                {String(h % 24).padStart(2, "0")}:00{h === 24 ? " (মধ্যরাত)" : ""}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Working days">
        {DAY_NAMES.map((name, d) => {
          const on = days.includes(d);
          return (
            <button
              key={name}
              type="button"
              aria-pressed={on}
              onClick={() => setDays((cur) => (on ? cur.filter((x) => x !== d) : [...cur, d]))}
              className={`h-8 min-w-9 rounded-full px-2 text-[11px] font-bold ring-1 transition-colors ${
                on ? "bg-forest-800 text-white ring-forest-700" : "bg-white text-ink-soft ring-line"
              }`}
              title={name}
            >
              {SHIFT_DAYS[d]}
            </button>
          );
        })}
        {(from !== "" || to !== "" || days.length > 0) && (
          <button
            type="button"
            onClick={() => {
              setFrom("");
              setTo("");
              setDays([]);
            }}
            className="h-8 rounded-full px-2 text-[11px] font-semibold text-forest-800 underline underline-offset-2"
          >
            যেকোনো সময়
          </button>
        )}
      </div>
      {error ? <p className="mt-2 text-[11px] font-semibold text-rose-700">{error}</p> : null}
      {dirty ? (
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="mt-3 h-10 w-full rounded-xl bg-forest-800 text-xs font-bold text-white disabled:opacity-60"
        >
          {saving ? "সেভ হচ্ছে…" : "শিফট সেভ করুন"}
        </button>
      ) : null}
    </section>
  );
}
