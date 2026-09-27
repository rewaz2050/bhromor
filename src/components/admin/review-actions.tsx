"use client";

/**
 * Round 4 (2026-09-26) — staff decision buttons for a shop or rider
 * application, shared by Admin → Shops and Admin → Riders.
 *
 * Pending → Approve, or Reject with a reason the applicant reads on their
 * login page (inline textarea, no window.prompt — keyboard and screen-reader
 * friendly). Rejected → Approve anyway / Re-open (back to pending). Active
 * → Suspend (with an optional reason). Suspended → Re-activate. Every
 * decision goes through POST /api/admin/{shops,riders}/[id]/review, which
 * stamps who decided and when; `ReviewSummary` shows that audit line.
 */

import { useId, useState } from "react";
import type { ApplicationReview, ApplicationStatus } from "@/lib/catalog";
import { IconCheck } from "@/components/ui/icons";

export interface ReviewActionsProps {
  kind: "shop" | "rider";
  name: string;
  status: ApplicationStatus;
  onDecide: (status: ApplicationStatus, note?: string) => void | Promise<unknown>;
  /** Extra warning line in the suspend confirm (what stops immediately). */
  suspendEffect: string;
}

const pill =
  "inline-flex min-h-9 items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest-800";

export function ReviewActions({ kind, name, status, onDecide, suspendEffect }: ReviewActionsProps) {
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  const [noteError, setNoteError] = useState<string | null>(null);
  const noteId = useId();

  const sendRejection = () => {
    const reason = note.trim();
    if (reason.length < 3) {
      setNoteError("Write the reason the applicant will read — a few words are enough.");
      return;
    }
    setNoteError(null);
    void onDecide("rejected", reason);
    setRejecting(false);
    setNote("");
  };

  if (rejecting) {
    return (
      <form
        className="w-full rounded-2xl bg-rose-50 p-3 ring-1 ring-rose-200"
        onSubmit={(e) => {
          e.preventDefault();
          sendRejection();
        }}
        aria-labelledby={`${noteId}-title`}
      >
        <p id={`${noteId}-title`} className="text-xs font-semibold text-rose-900">
          Reject {kind === "shop" ? "shop" : "rider"} “{name}” — why?
        </p>
        <label htmlFor={noteId} className="mt-2 block text-[11px] font-semibold text-rose-900">
          Reason shown to the applicant on their login page
        </label>
        <textarea
          id={noteId}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          maxLength={400}
          autoFocus
          className="mt-1 w-full rounded-xl border border-rose-200 bg-white px-3 py-2 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-rose-500"
          placeholder={
            kind === "shop"
              ? "e.g. The phone number does not answer / the address is outside our zones — fix it and apply again."
              : "e.g. NID photo is blurry / the phone number does not answer — fix it and apply again."
          }
          aria-describedby={noteError ? `${noteId}-err` : undefined}
          aria-invalid={noteError ? true : undefined}
        />
        {noteError && (
          <p id={`${noteId}-err`} role="alert" className="mt-1 text-[11px] font-medium text-rose-800">
            {noteError}
          </p>
        )}
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="submit" className={`${pill} bg-rose-700 text-white hover:bg-rose-600`}>
            Send rejection
          </button>
          <button
            type="button"
            onClick={() => {
              setRejecting(false);
              setNoteError(null);
            }}
            className={`${pill} bg-white text-ink-soft ring-1 ring-line hover:text-ink`}
          >
            Cancel
          </button>
        </div>
      </form>
    );
  }

  return (
    <>
      {(status === "pending" || status === "rejected") && (
        <button
          type="button"
          onClick={() => void onDecide("active")}
          className={`${pill} bg-emerald-700 text-white hover:bg-emerald-600`}
        >
          <IconCheck className="h-3.5 w-3.5" /> Approve
        </button>
      )}
      {status === "pending" && (
        <button
          type="button"
          onClick={() => setRejecting(true)}
          className={`${pill} text-rose-700 ring-1 ring-rose-300 hover:bg-rose-50`}
        >
          Reject…
        </button>
      )}
      {status === "rejected" && (
        <button
          type="button"
          onClick={() => void onDecide("pending")}
          className={`${pill} text-forest-800 ring-1 ring-forest-300 hover:bg-forest-800 hover:text-ivory-50`}
        >
          Re-open
        </button>
      )}
      {status === "active" && (
        <button
          type="button"
          onClick={() => {
            if (window.confirm(`Suspend “${name}”? ${suspendEffect}`)) {
              const reason = window.prompt("Reason (optional — kept for staff, shown to nobody else):", "") ?? "";
              void onDecide("suspended", reason.trim());
            }
          }}
          className={`${pill} text-rose-700 ring-1 ring-rose-300 hover:bg-rose-50`}
        >
          Suspend
        </button>
      )}
      {status === "suspended" && (
        <button
          type="button"
          onClick={() => void onDecide("active")}
          className={`${pill} text-forest-800 ring-1 ring-forest-300 hover:bg-forest-800 hover:text-ivory-50`}
        >
          Re-activate
        </button>
      )}
    </>
  );
}

/** How long ago a decision was made, for the audit line. */
export const reviewAgeLabel = (at: number, now: number = Date.now()): string => {
  const mins = Math.max(0, Math.round((now - at) / 60_000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
};

/**
 * The audit line + rejection reason under a card header. Nothing renders
 * for a row that was never reviewed (legacy rows, or before the migration).
 */
export function ReviewSummary({
  status,
  review,
  now,
}: {
  status: ApplicationStatus;
  review?: ApplicationReview;
  now?: number;
}) {
  if (!review || (!review.at && !review.note && !review.by)) return null;
  const verb =
    status === "active"
      ? "Approved"
      : status === "rejected"
        ? "Rejected"
        : status === "suspended"
          ? "Suspended"
          : "Re-opened";
  return (
    <div className="mt-2 text-xs">
      <p className="text-ink-soft">
        {verb}
        {review.by ? ` by ${review.by}` : ""}
        {review.at ? ` · ${reviewAgeLabel(review.at, now)}` : ""}
      </p>
      {review.note && (
        <p
          className={`mt-1 rounded-xl px-3 py-2 ring-1 ${
            status === "rejected"
              ? "bg-rose-50 text-rose-900 ring-rose-200"
              : "bg-ivory-100 text-ink ring-line"
          }`}
        >
          <span className="font-semibold">{status === "rejected" ? "Reason sent to applicant: " : "Note: "}</span>
          {review.note}
        </p>
      )}
    </div>
  );
}
