"use client";

import { useEffect, useId, useRef, useState } from "react";

/**
 * Asks staff for a written reason before a consequential action (cancel an
 * order, release a rider). Replaces `window.prompt`, which on a phone looks
 * like a system error, cannot explain a too-short answer (it just did nothing)
 * and cannot be styled or tested. The reason is required to be `minLength`
 * characters; the button says so until it is.
 */
export function ReasonDialog({
  title,
  confirmLabel,
  initial = "",
  minLength,
  busy = false,
  onConfirm,
  onCancel,
}: {
  title: string;
  confirmLabel: string;
  initial?: string;
  minLength: number;
  busy?: boolean;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState(initial);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const titleId = useId();
  const trimmed = reason.trim();
  const ok = trimmed.length >= minLength;

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-forest-950/50 p-4 sm:items-center"
      onKeyDown={(e) => {
        if (e.key === "Escape") onCancel();
      }}
    >
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="w-full max-w-md space-y-3 rounded-2xl bg-paper p-5 shadow-xl ring-1 ring-line">
        <h2 id={titleId} className="text-sm font-semibold leading-6 text-forest-900">
          {title}
        </h2>
        <textarea
          ref={inputRef}
          aria-label="Reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={300}
          rows={3}
          className="w-full rounded-xl bg-ivory-100 px-3 py-2 text-sm text-ink ring-1 ring-line"
        />
        {!ok && <p className="text-[11px] text-ink-soft">At least {minLength} characters — it is saved in the history.</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-full px-4 py-1.5 text-xs font-semibold text-ink-soft hover:bg-ivory-100">
            Back
          </button>
          <button
            type="button"
            disabled={!ok || busy}
            onClick={() => onConfirm(trimmed)}
            className="rounded-full bg-rose-700 px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
