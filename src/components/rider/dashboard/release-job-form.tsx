"use client";

import { useEffect, useRef, useState } from "react";
import { releaseAcceptedJob } from "@/lib/rider-delivery-actions";

/**
 * "Can't do this one?" — only offered between accept and pickup. After the
 * parcel is in hand the rider uses the failed-delivery form instead. A server
 * refusal is shown inline; the reason needs ≥ 5 characters.
 */
interface ReleaseJobFormProps {
  assignmentId: string;
  /** Called only for the current form's accepted completion. */
  onReleased: (message: string) => void;
}

export function ReleaseJobForm(props: ReleaseJobFormProps) {
  return <AssignmentReleaseJobForm key={props.assignmentId} {...props} />;
}

function AssignmentReleaseJobForm({
  assignmentId,
  onReleased,
}: ReleaseJobFormProps) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const owner = useRef({
    active: false,
    open: false,
    generation: 0,
    request: 0,
    busy: false,
  });
  useEffect(() => {
    const state = owner.current;
    state.active = true;
    return () => {
      state.active = false;
      state.generation++;
    };
  }, []);

  const changeOpen = (next: boolean) => {
    const state = owner.current;
    if (!state.active) return;
    state.open = next;
    state.generation++;
    setOpen(next);
    setError(null);
    // Cancel closes the view, not the transport; keep its pending-write lock.
    setBusy(state.busy);
  };

  const submit = async () => {
    const state = owner.current;
    if (!state.active || !state.open || state.busy) return;
    const generation = state.generation;
    const request = ++state.request;
    const current = () =>
      state.active &&
      state.open &&
      state.generation === generation &&
      state.request === request;
    state.busy = true;
    setBusy(true);
    setError(null);
    let result: Awaited<ReturnType<typeof releaseAcceptedJob>>;
    try {
      result = await releaseAcceptedJob(assignmentId, reason);
    } catch {
      if (current()) setError("ফেরত দেওয়া যায়নি — আবার চেষ্টা করুন।");
      return;
    } finally {
      // Transport ownership can outlive an open view, but not its assignment instance.
      if (state.active && state.request === request) {
        state.busy = false;
        setBusy(false);
      }
    }
    if (!current()) return;
    if (!result.ok) {
      setError(result.message);
      return;
    }
    changeOpen(false);
    setReason("");
    onReleased(result.message);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          changeOpen(!owner.current.open);
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
                changeOpen(false);
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
