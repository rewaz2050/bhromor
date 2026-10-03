"use client";

/**
 * Item N — Admin → Rider → driving-licence expiry. Staff read the date off
 * the licence photo (rider KYC) and record it here; the scheduler warns 14
 * days ahead and takes the rider offline once it lapses.
 */

import { useCallback, useEffect, useState } from "react";
import { apiErrorMessage, apiGet, apiSend } from "@/lib/admin-api";
import type { LicenceStatus } from "@/lib/kyc-expiry";

interface Licence {
  vehicle: string;
  expiresOn: string | null;
  status: LicenceStatus;
}

const TONE: Record<LicenceStatus["kind"], { label: (s: LicenceStatus) => string; cls: string }> = {
  na: { label: () => "Licence not required (bicycle)", cls: "bg-ivory-100 text-ink-soft ring-line" },
  unrecorded: { label: () => "Expiry not recorded — read it from the licence photo", cls: "bg-amber-50 text-amber-900 ring-amber-200" },
  ok: { label: (s) => `Valid — ${s.daysLeft} days left`, cls: "bg-emerald-50 text-emerald-900 ring-emerald-200" },
  soon: { label: (s) => `Expires in ${s.daysLeft} day(s) — remind the rider`, cls: "bg-amber-50 text-amber-900 ring-amber-200" },
  expired: { label: (s) => `Expired ${Math.abs(s.daysLeft ?? 0)} day(s) ago — rider cannot go online`, cls: "bg-rose-50 text-rose-900 ring-rose-200" },
};

export function RiderLicenceCard({ riderId }: { riderId: string }) {
  const [state, setState] = useState<{ ready: boolean; licence: Licence | null } | null>(null);
  const [date, setDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await apiGet<{ ready: boolean; licence: Licence | null }>(
        `/api/admin/riders/${encodeURIComponent(riderId)}/licence`,
      );
      setState(data);
      setDate(data.licence?.expiresOn ?? "");
    } catch (err) {
      setMsg({ ok: false, text: apiErrorMessage(err) });
    }
  }, [riderId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount
    void load();
  }, [load]);

  const save = async (value: string | null): Promise<void> => {
    setBusy(true);
    setMsg(null);
    try {
      const data = await apiSend<{ ready: boolean; licence: Licence }>(
        `/api/admin/riders/${encodeURIComponent(riderId)}/licence`,
        "PATCH",
        { expiresOn: value },
      );
      setState(data);
      setDate(data.licence.expiresOn ?? "");
      setMsg({ ok: true, text: value ? "Saved." : "Cleared." });
    } catch (err) {
      setMsg({ ok: false, text: apiErrorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  if (!state) return msg ? <p role="alert" className="text-xs text-rose-800">{msg.text}</p> : null;
  if (!state.ready || !state.licence) {
    return (
      <section data-testid="licence-card" className="rounded-2xl bg-amber-50 p-4 text-xs text-amber-900 ring-1 ring-amber-200">
        Licence tracking isn&apos;t switched on yet — run migration <code>202610020005</code> in the Supabase SQL Editor.
      </section>
    );
  }
  const { licence } = state;
  const tone = TONE[licence.status.kind];
  return (
    <section data-testid="licence-card" aria-label="Driving licence expiry" className="rounded-2xl bg-paper p-5 ring-1 ring-line">
      <h2 className="font-display text-lg font-bold text-forest-900">Driving licence</h2>
      <p data-testid="licence-status" data-kind={licence.status.kind} className={`mt-2 inline-block rounded-full px-3 py-1 text-xs font-semibold ring-1 ${tone.cls}`}>
        {tone.label(licence.status)}
      </p>
      {licence.status.kind !== "na" && (
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="text-xs font-semibold text-ink-soft">
            Expiry date
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="mt-1 block rounded-xl border border-line bg-white px-3 py-2 text-sm"
            />
          </label>
          <button
            type="button"
            disabled={busy || date === "" || date === (licence.expiresOn ?? "")}
            onClick={() => void save(date)}
            className="rounded-full bg-forest-900 px-4 py-2 text-xs font-semibold text-ivory-50 disabled:opacity-40"
          >
            Save
          </button>
          {licence.expiresOn && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void save(null)}
              className="rounded-full bg-paper px-4 py-2 text-xs font-semibold ring-1 ring-line disabled:opacity-40"
            >
              Clear
            </button>
          )}
        </div>
      )}
      {msg && (
        <p role={msg.ok ? "status" : "alert"} className={`mt-2 text-xs font-medium ${msg.ok ? "text-emerald-800" : "text-rose-800"}`}>
          {msg.text}
        </p>
      )}
    </section>
  );
}
