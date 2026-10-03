"use client";

/**
 * Failed-delivery photo (202610020020) — whether a rider reporting a failed attempt is asked for a
 * photo of the door / gate / address. OFF by default; changes apply the next time a rider opens the form.
 */
import { useCallback, useEffect, useState } from "react";
import { apiErrorMessage, apiGet, apiSend } from "@/lib/admin-api";
import { FAILED_PROOF_LABEL, sanitizeFailedProofMode, type FailedProofMode } from "@/lib/failed-proof";

export default function FailedProofCard() {
  const [mode, setMode] = useState<FailedProofMode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await apiGet<{ mode: unknown }>("/api/admin/riders/failed-proof");
      setMode(sanitizeFailedProofMode(data?.mode));
      setError(null);
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount
    void load();
  }, [load]);

  const change = async (next: FailedProofMode) => {
    if (busy) return;
    setBusy(true);
    setSaved(false);
    try {
      const data = await apiSend<{ mode: unknown }>("/api/admin/riders/failed-proof", "PATCH", { mode: next });
      setMode(sanitizeFailedProofMode(data?.mode));
      setSaved(true);
      setError(null);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (mode === null && !error) return null;
  return (
    <section data-testid="failed-proof-card" className="space-y-3 rounded-2xl bg-paper p-5 ring-1 ring-line">
      <div>
        <h2 className="font-display text-base font-semibold text-forest-900">📸 Failed-delivery photo</h2>
        <p className="mt-1 text-[11px] text-ink-soft">
          “Customer not answering” is otherwise the rider’s word alone. A photo of the door or gate backs up a disputed failure, a returned parcel or a failed-delivery fee. The customer never sees it.
        </p>
      </div>
      {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-900 ring-1 ring-rose-200">{error}</p>}
      {saved && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900 ring-1 ring-emerald-200">Saved.</p>}
      {mode !== null && (
        <div role="radiogroup" aria-label="Failed-delivery photo" className="space-y-2">
          {([0, 1, 2] as const).map((m) => (
            <label key={m} className="flex cursor-pointer items-start gap-2 text-sm text-ink">
              <input
                type="radio"
                name="failed-proof-mode"
                checked={mode === m}
                disabled={busy}
                onChange={() => void change(m)}
                className="mt-1"
              />
              <span>{FAILED_PROOF_LABEL[m]}</span>
            </label>
          ))}
        </div>
      )}
      <p className="text-[11px] text-ink-soft">
        Needs migration <code>202610020020_failed_delivery_proof.sql</code>; photos only work when image uploads (Cloudinary) are configured.
      </p>
    </section>
  );
}
