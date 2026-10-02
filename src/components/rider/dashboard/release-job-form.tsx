"use client";

import { useState } from "react";
import { releaseAcceptedJob } from "@/lib/rider-delivery-actions";

/**
 * "Can't do this one?" — only offered between accept and pickup. After the
 * parcel is in hand the rider uses the failed-delivery form instead. A server
 * refusal is shown inline; the reason needs ≥ 5 characters.
 */
export function ReleaseJobForm({
  assignmentId,
  onReleased,
}: {
  assignmentId: string;
  /** Called with the message to flash once the job is handed back. */
  onReleased: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await releaseAcceptedJob(assignmentId, reason);
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setOpen(false);
    setReason("");
    onReleased(result.message);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError(null);
          setOpen((v) => !v);
        }}
        className="text-[11px] text-rose-700 underline"
      >
        এই কাজটি করতে পারছেন না? ফেরত দিন
      </button>
      {open && (
        <div className="space-y-2 rounded-xl bg-rose-50 p-3 ring-1 ring-rose-200">
          <input
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              setError(null);
            }}
            minLength={5}
            maxLength={300}
            placeholder="কারণ: বাইকে সমস্যা, অনেক দূর…"
            className="w-full rounded-lg bg-white px-3 py-2 text-xs ring-1 ring-line"
            aria-label="Hand back reason"
          />
          {error && (
            <p role="alert" className="text-xs font-semibold text-rose-800">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy || reason.trim().length < 5}
              onClick={() => void submit()}
              className="rounded-full bg-rose-700 px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
            >
              {busy ? "ফেরত হচ্ছে…" : "কাজ ফেরত দিন"}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setError(null);
              }}
              className="text-xs text-ink-soft"
            >
              বাতিল
            </button>
          </div>
        </div>
      )}
    </>
  );
}
