"use client";

import { useState } from "react";
import { reportFailedAttempt } from "@/lib/rider-delivery-actions";

/**
 * "Customer unreachable?" — only offered after pickup. A server refusal is
 * shown inline (audit B7: it used to be dropped); the reason needs ≥ 5 characters.
 */
export function FailedAttemptForm({
  assignmentId,
  onRecorded,
}: {
  assignmentId: string;
  /** Called with the message to flash once the attempt is on record. */
  onRecorded: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await reportFailedAttempt(assignmentId, reason);
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setOpen(false);
    setReason("");
    onRecorded(result.message);
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
        Customer unreachable? Report failed attempt
      </button>
      {open && (
        <div className="rounded-xl bg-rose-50 p-3 ring-1 ring-rose-200 space-y-2">
          <input
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              setError(null);
            }}
            minLength={5}
            maxLength={300}
            placeholder="Reason: phone off, address wrong, etc"
            className="w-full rounded-lg bg-white px-3 py-2 text-xs ring-1 ring-line"
            aria-label="Failed attempt reason"
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
              Submit failed
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setError(null);
              }}
              className="text-xs text-ink-soft"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </>
  );
}
