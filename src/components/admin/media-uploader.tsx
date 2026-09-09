"use client";

import { useRef, useState } from "react";
import { AdminApiError, apiSend } from "@/lib/admin-api";
import { IconPlus } from "@/components/ui/icons";

interface SignResponse {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  folder: string;
  signature: string;
}

const MAX_BYTES = 8 * 1024 * 1024;

/**
 * Direct-to-Cloudinary upload (§48): the API secret never leaves the
 * server — the browser signs via /api/media/sign, then POSTs the file to
 * Cloudinary and hands the secure URL back to the media library.
 */
export default function MediaUploader({
  onUploaded,
}: {
  onUploaded: (url: string, label: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const upload = async (file: File) => {
    setError(null);
    setStatus(null);
    if (!file.type.startsWith("image/")) {
      setError("Choose an image file (JPG, PNG or WebP).");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("That file is larger than 8 MB — resize it first.");
      return;
    }
    setBusy(true);
    setStatus("Requesting upload signature…");
    try {
      let sign: SignResponse;
      try {
        sign = await apiSend<SignResponse>("/api/media/sign", "POST", {
          folder: "prosanti/products",
        });
      } catch (err) {
        setError(
          err instanceof AdminApiError && err.status === 503
            ? "Cloudinary is not configured yet — add by URL below instead."
            : (err instanceof AdminApiError ? err.message : "Could not start the upload."),
        );
        return;
      }
      setStatus("Uploading…");
      const form = new FormData();
      form.append("file", file);
      form.append("api_key", sign.apiKey);
      form.append("timestamp", String(sign.timestamp));
      form.append("folder", sign.folder);
      form.append("signature", sign.signature);
      const res = await fetch(
        `https://api.cloudinary.com/v1_1/${sign.cloudName}/image/upload`,
        { method: "POST", body: form },
      );
      const data = (await res.json().catch(() => null)) as {
        secure_url?: string;
        error?: { message?: string };
      } | null;
      if (!res.ok || !data?.secure_url) {
        setError(
          data?.error?.message ?? "The upload failed — try again.",
        );
        return;
      }
      onUploaded(data.secure_url, file.name.replace(/\.[a-z0-9]+$/i, ""));
      setStatus("Uploaded — added to the library below.");
    } catch {
      setError("Could not reach the upload service — try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl bg-paper p-5 ring-1 ring-line">
      <p className="text-[0.7rem] font-semibold uppercase tracking-[0.2em] text-ink-soft">
        Upload a new image
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          aria-label="Choose an image to upload"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void upload(file);
          }}
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className="inline-flex items-center gap-2 rounded-xl bg-forest-800 px-5 py-2.5 text-sm font-semibold text-ivory-50 transition-colors hover:bg-forest-700 disabled:opacity-60"
        >
          <IconPlus className="h-4 w-4" />
          {busy ? "Uploading…" : "Choose image"}
        </button>
        <p className="text-xs text-ink-soft">JPG, PNG or WebP · up to 8 MB</p>
      </div>
      {status && !error && (
        <p role="status" className="mt-3 text-xs font-medium text-emerald-700">
          {status}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 rounded-xl bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-800 ring-1 ring-rose-200">
          {error}
        </p>
      )}
    </div>
  );
}
