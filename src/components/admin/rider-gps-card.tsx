"use client";

/**
 * Admin → Rider → "GPS jump alerts". A flag means two consecutive pings were ≥ 2 km apart but
 * too far for the time between them (> 120 km/h) — the classic fake-GPS signature. It is a
 * hint for a human, never a verdict: nothing is suspended or withheld automatically.
 */

import { useCallback, useEffect, useState } from "react";
import { apiErrorMessage, apiGet } from "@/lib/admin-api";
import type { RiderGpsFlags } from "@/lib/db/rider-gps-flags";

const fmtWhen = (iso: string): string =>
  new Date(iso).toLocaleString("en-GB", { timeZone: "Asia/Dhaka", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

const mapUrl = (p: { lat: number; lng: number }): string =>
  `https://www.google.com/maps?q=${p.lat},${p.lng}`;

export function RiderGpsCard({ riderId }: { riderId: string }) {
  const [state, setState] = useState<RiderGpsFlags | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await apiGet<RiderGpsFlags>(`/api/admin/riders/${encodeURIComponent(riderId)}/gps-flags`);
      setState(data && Array.isArray(data.flags) ? data : null);
      setError(null);
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }, [riderId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount
    void load();
  }, [load]);

  if (error) return <p role="alert" className="text-xs text-rose-800">{error}</p>;
  if (!state) return null;
  if (!state.ready) {
    return (
      <section data-testid="gps-card" className="rounded-2xl bg-amber-50 p-4 text-xs text-amber-900 ring-1 ring-amber-200">
        GPS jump alerts aren&apos;t switched on yet — run migration <code>202610020019</code> in the Supabase SQL Editor.
      </section>
    );
  }
  if (state.flags.length === 0) {
    return (
      <section data-testid="gps-card" className="rounded-2xl bg-paper p-4 ring-1 ring-line">
        <h2 className="font-display text-lg font-bold text-forest-900">GPS jump alerts</h2>
        <p data-testid="gps-clean" className="mt-1 text-xs text-ink-soft">No impossible location jumps recorded. ✓</p>
      </section>
    );
  }
  return (
    <section data-testid="gps-card" className="rounded-2xl bg-rose-50 p-5 ring-1 ring-rose-200">
      <h2 className="font-display text-lg font-bold text-rose-900">GPS jump alerts</h2>
      <p data-testid="gps-summary" className="mt-1 text-xs text-rose-900">
        {state.last30Days} in the last 30 days. Each one is a location ping that moved ≥ 2 km faster than 120 km/h — often a fake-GPS app,
        sometimes a phone swap or a bad fix. Check the delivery proof and talk to the rider before acting; nothing is blocked automatically.
      </p>
      <ul className="mt-3 divide-y divide-rose-200 text-sm">
        {state.flags.map((f) => (
          <li key={f.id} data-testid="gps-flag" className="flex flex-wrap items-center justify-between gap-2 py-2">
            <span className="font-semibold text-rose-950">
              {f.distanceKm} km in {f.seconds < 120 ? `${f.seconds} s` : `${Math.round(f.seconds / 60)} min`} → {f.speedKmh.toLocaleString("en-IN")} km/h
            </span>
            <span className="flex items-center gap-3 text-xs text-ink-soft">
              {fmtWhen(f.at)}
              <a href={mapUrl(f.from)} target="_blank" rel="noreferrer" className="underline underline-offset-2">from</a>
              <a href={mapUrl(f.to)} target="_blank" rel="noreferrer" className="underline underline-offset-2">to</a>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
