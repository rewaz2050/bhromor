"use client";

import { useEffect, useRef, useState } from "react";
import {
  fetchFailedProofConfig,
  reportFailedAttempt,
  uploadDeliveryProof,
} from "@/lib/rider-delivery-actions";

/**
 * "Customer unreachable?" — only offered after pickup. A server refusal is
 * shown inline (audit B7: it used to be dropped); the reason needs ≥ 5 characters.
 * When staff switch on the failed-attempt photo (off by default) the form also takes a photo of
 * the door / gate / address — or, if "required" and none can be taken, a written reason.
 */
interface FailedAttemptFormProps {
  assignmentId: string;
  /** Called with the message once the current form's attempt is on record. */
  onRecorded: (message: string) => void;
}

export function FailedAttemptForm(props: FailedAttemptFormProps) {
  // Assignment-specific drafts/proof must never be reused for another task.
  return <AssignmentFailedAttemptForm key={props.assignmentId} {...props} />;
}

function AssignmentFailedAttemptForm({
  assignmentId,
  onRecorded,
}: FailedAttemptFormProps) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<0 | 1 | 2>(0);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [noPhotoOpen, setNoPhotoOpen] = useState(false);
  const [noPhotoReason, setNoPhotoReason] = useState("");

  const owner = useRef({
    active: false,
    open: false,
    generation: 0,
    upload: 0,
    submit: 0,
    config: 0,
    uploading: false,
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

  const setFormOpen = (next: boolean) => {
    const state = owner.current;
    state.open = next;
    state.generation++;
    state.uploading = false;
    // Closing a form does not cancel an already-started report.
    setOpen(next);
    setUploading(false);
    setBusy(state.busy);
    setError(null);
  };

  const toggle = () => {
    const state = owner.current;
    if (!state.active) return;
    const opening = !state.open;
    setFormOpen(opening);
    if (opening) {
      const generation = state.generation;
      const config = ++state.config;
      const current = () =>
        state.active &&
        state.open &&
        state.generation === generation &&
        state.config === config;
      // Preserve the existing no-photo fallback when settings cannot be read.
      void (async () => {
        try {
          const c = await fetchFailedProofConfig();
          if (current()) setMode(c.uploads ? c.mode : 0);
        } catch {
          if (current()) setMode(0);
        }
      })();
    }
  };

  const upload = async (file: File) => {
    const state = owner.current;
    if (!state.active || !state.open) return;
    const generation = state.generation;
    const request = ++state.upload;
    const current = () =>
      state.active &&
      state.open &&
      state.generation === generation &&
      state.upload === request;
    state.uploading = true;
    setUploading(true);
    setError(null);
    let result: Awaited<ReturnType<typeof uploadDeliveryProof>>;
    try {
      result = await uploadDeliveryProof(file);
    } catch {
      if (current()) {
        setNoPhotoOpen(true);
        setError("Photo upload failed — please try again.");
      }
      return;
    } finally {
      if (current()) {
        state.uploading = false;
        setUploading(false);
      }
    }
    if (!current()) return;
    if (result.ok) setPhotoUrl(result.url);
    else {
      setNoPhotoOpen(true);
      setError(result.message);
    }
  };

  const submit = async () => {
    const state = owner.current;
    if (!state.active || !state.open || state.busy || state.uploading) return;
    const generation = state.generation;
    const request = ++state.submit;
    const ownsLock = () => state.active && state.submit === request;
    const current = () =>
      state.active && state.open && state.generation === generation;
    state.busy = true;
    setBusy(true);
    setError(null);
    let result: Awaited<ReturnType<typeof reportFailedAttempt>>;
    try {
      result = await reportFailedAttempt(assignmentId, reason, {
        proofUrl: photoUrl,
        noPhotoReason: photoUrl ? null : noPhotoReason.trim() || null,
      });
    } catch {
      if (current()) setError("Failed — try again.");
      return;
    } finally {
      // Transport ownership survives close/reopen; view ownership does not.
      if (ownsLock()) {
        state.busy = false;
        setBusy(false);
      }
    }
    if (!current()) return;
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setFormOpen(false);
    setReason("");
    setPhotoUrl(null);
    setNoPhotoOpen(false);
    setNoPhotoReason("");
    onRecorded(result.message);
  };

  return (
    <>
      <button
        type="button"
        onClick={toggle}
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
          {mode > 0 && (
            <div data-testid="failed-proof" className="space-y-1">
              <p className="text-[11px] font-semibold text-ink-soft">
                📸 দরজা/গেট/ঠিকানার ছবি{" "}
                {mode === 2 ? "(বাধ্যতামূলক)" : "(ঐচ্ছিক)"}
              </p>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                aria-label="Failed attempt photo"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void upload(f);
                }}
                className="w-full rounded-lg bg-white px-2 py-1.5 text-xs ring-1 ring-line"
              />
              {uploading && (
                <p className="text-[11px] text-amber-700">আপলোড হচ্ছে…</p>
              )}
              {photoUrl && (
                <p
                  data-testid="failed-proof-ok"
                  className="text-[11px] font-semibold text-emerald-800"
                >
                  ✓ ছবি আপলোড হয়েছে
                </p>
              )}
              {mode === 2 && !photoUrl && !noPhotoOpen && (
                <button
                  type="button"
                  onClick={() => setNoPhotoOpen(true)}
                  className="text-[11px] font-semibold text-ink-soft underline"
                >
                  ছবি তুলতে পারছি না
                </button>
              )}
              {mode === 2 && !photoUrl && noPhotoOpen && (
                <input
                  value={noPhotoReason}
                  onChange={(e) => setNoPhotoReason(e.target.value)}
                  maxLength={200}
                  placeholder="ছবি ছাড়া কেন (যেমন: ক্যামেরা কাজ করছে না)"
                  aria-label="Reason no photo"
                  className="w-full rounded-lg bg-white px-3 py-2 text-xs ring-1 ring-line"
                />
              )}
            </div>
          )}
          {error && (
            <p role="alert" className="text-xs font-semibold text-rose-800">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy || uploading || reason.trim().length < 5}
              onClick={() => void submit()}
              className="rounded-full bg-rose-700 px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
            >
              Submit failed
            </button>
            <button
              type="button"
              onClick={() => {
                setFormOpen(false);
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
