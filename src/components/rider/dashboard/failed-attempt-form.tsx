"use client";

import { useState } from "react";
import { fetchFailedProofConfig, reportFailedAttempt, uploadDeliveryProof } from "@/lib/rider-delivery-actions";

/**
 * "Customer unreachable?" — only offered after pickup. A server refusal is
 * shown inline (audit B7: it used to be dropped); the reason needs ≥ 5 characters.
 * When staff switch on the failed-attempt photo (off by default) the form also takes a photo of
 * the door / gate / address — or, if "required" and none can be taken, a written reason.
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
  const [mode, setMode] = useState<0 | 1 | 2>(0);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [noPhotoOpen, setNoPhotoOpen] = useState(false);
  const [noPhotoReason, setNoPhotoReason] = useState("");

  const toggle = () => {
    setError(null);
    const opening = !open;
    setOpen(opening);
    if (opening) {
      // Asked each time it opens, so a staff change applies at once. Failure = "no photo asked".
      void fetchFailedProofConfig().then((c) => {
        const next = c.uploads ? c.mode : 0;
        setMode((m) => (m === next ? m : next));
      });
    }
  };

  const upload = async (file: File) => {
    setUploading(true);
    setError(null);
    const result = await uploadDeliveryProof(file);
    setUploading(false);
    if (result.ok) setPhotoUrl(result.url);
    else {
      setNoPhotoOpen(true);
      setError(result.message);
    }
  };

  const submit = async () => {
    if (busy || uploading) return;
    setBusy(true);
    setError(null);
    const result = await reportFailedAttempt(assignmentId, reason, {
      proofUrl: photoUrl,
      noPhotoReason: photoUrl ? null : noPhotoReason.trim() || null,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setOpen(false);
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
                📸 দরজা/গেট/ঠিকানার ছবি {mode === 2 ? "(বাধ্যতামূলক)" : "(ঐচ্ছিক)"}
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
              {uploading && <p className="text-[11px] text-amber-700">আপলোড হচ্ছে…</p>}
              {photoUrl && <p data-testid="failed-proof-ok" className="text-[11px] font-semibold text-emerald-800">✓ ছবি আপলোড হয়েছে</p>}
              {mode === 2 && !photoUrl && !noPhotoOpen && (
                <button type="button" onClick={() => setNoPhotoOpen(true)} className="text-[11px] font-semibold text-ink-soft underline">
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
