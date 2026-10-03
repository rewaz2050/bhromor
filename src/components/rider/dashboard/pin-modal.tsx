"use client";

import { useState } from "react";
import Image from "next/image";
import { uploadDeliveryProof } from "@/lib/rider-delivery-actions";
import { IconShield } from "@/components/ui/icons";

/**
 * Delivery verification: the customer's 4-digit code plus a proof photo (or,
 * when a photo truly cannot be taken, a reason the admin can read — audit N9).
 * Mounted only while open, so every opening starts clean. `onSubmit` returns
 * the server's refusal text, or null once the delivery went through.
 */
export function PinModal({
  onSubmit,
  onClose,
  onFlash,
}: {
  onSubmit: (pin: string, proofUrl: string | null, noPhotoReason: string | null) => Promise<string | null>;
  onClose: () => void;
  onFlash: (message: string) => void;
}) {
  const [enteredPin, setEnteredPin] = useState("");
  const [pinError, setPinError] = useState("");
  const [proofUrl, setProofUrl] = useState<string | null>(null);
  const [proofUploading, setProofUploading] = useState(false);
  const [noPhotoOpen, setNoPhotoOpen] = useState(false);
  const [noPhotoReason, setNoPhotoReason] = useState("");

  const upload = async (file: File) => {
    setProofUploading(true);
    setPinError("");
    const result = await uploadDeliveryProof(file);
    setProofUploading(false);
    if (result.ok) {
      setProofUrl(result.url);
      onFlash("📸 Proof photo uploaded!");
    } else {
      setNoPhotoOpen(true);
      setPinError(result.message);
    }
  };

  const submit = async () => {
    const error = await onSubmit(enteredPin.trim(), proofUrl, proofUrl ? null : noPhotoReason.trim() || null);
    if (error !== null) setPinError(error);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4"
    >
      <div className="w-full max-w-sm rounded-3xl border border-line bg-paper p-6 shadow-xl space-y-4">
        <div className="text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-800">
            <IconShield className="h-6 w-6" />
          </span>
          <h3 className="font-display mt-3 text-lg font-bold text-forest-900">
            ডেলিভারি ভেরিফিকেশন পিন
          </h3>
          <p className="mt-1 text-xs text-ink-soft">
            কাস্টমারের কাছ থেকে ৪-সংখ্যার কোডটি নিয়ে নিচে টাইপ করুন
          </p>
        </div>

        {pinError && (
          <p role="alert" className="rounded-xl bg-rose-50 p-2.5 text-center text-xs font-semibold text-rose-800">
            {pinError}
          </p>
        )}

        <div>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]{4}"
            maxLength={4}
            value={enteredPin}
            onChange={(e) => setEnteredPin(e.target.value.replace(/\D/g, ""))}
            placeholder="• • • •"
            className="h-14 w-full rounded-2xl border border-line bg-ivory-50 text-center font-mono text-2xl font-bold tracking-[0.5em] text-forest-900 focus:outline-none focus:ring-2 focus:ring-forest-800"
            autoFocus
          />
        </div>

        {/* Cloudinary Proof Photo */}
        <div className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-wider text-ink-soft">📸 Delivery Proof Photo</p>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload(f);
            }}
            className="w-full rounded-xl bg-ivory-100 px-3 py-2 text-xs ring-1 ring-line"
          />
          {proofUploading && <p className="text-xs text-amber-700">Uploading to Cloudinary...</p>}
          {proofUrl && (
            <div className="rounded-xl overflow-hidden ring-1 ring-line">
              <div className="relative h-32 w-full">
                <Image
                  src={proofUrl}
                  alt="Delivery proof photo"
                  fill
                  sizes="100vw"
                  className="object-cover"
                />
              </div>
              <p className="p-2 text-[10px] break-all text-ink-soft">{proofUrl}</p>
            </div>
          )}
          {!proofUrl && !noPhotoOpen && (
            <button
              type="button"
              onClick={() => setNoPhotoOpen(true)}
              className="text-[11px] font-semibold text-ink-soft underline"
            >
              ছবি তুলতে পারছি না
            </button>
          )}
          {!proofUrl && noPhotoOpen && (
            <div className="space-y-1">
              <label htmlFor="no-photo-reason" className="text-[11px] font-semibold text-ink-soft">
                ছবি ছাড়া ডেলিভারির কারণ (অ্যাডমিন দেখবে)
              </label>
              <input
                id="no-photo-reason"
                type="text"
                maxLength={200}
                value={noPhotoReason}
                onChange={(e) => setNoPhotoReason(e.target.value)}
                placeholder="যেমন: ক্যামেরা কাজ করছে না"
                className="w-full rounded-xl bg-ivory-100 px-3 py-2 text-xs ring-1 ring-line"
              />
            </div>
          )}
          <p className="text-[11px] text-ink-soft">ডেলিভারির ছবি বাধ্যতামূলক — কাস্টমারের হাতে পার্সেল দেওয়ার ছবি তুলুন।</p>
        </div>

        <div className="flex gap-2.5 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="h-12 flex-1 rounded-full border border-line bg-paper text-xs font-semibold text-ink-soft hover:bg-ivory-100"
          >
            বাতিল
          </button>
          <button
            type="button"
            disabled={enteredPin.length !== 4}
            onClick={() => void submit()}
            className="h-12 flex-1 rounded-full bg-forest-800 text-xs font-semibold text-ivory-50 hover:bg-forest-900 disabled:opacity-50"
          >
            ডেলিভারি সম্পন্ন করুন
          </button>
        </div>
      </div>
    </div>
  );
}
