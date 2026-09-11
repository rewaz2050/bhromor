"use client";

import { useRef, useState } from "react";
import { AdminApiError, apiSend } from "@/lib/admin-api";
import { IconPlus } from "@/components/ui/icons";
import type { MediaKind } from "@/lib/media";

interface SignResponse {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  folder: string;
  signature: string;
  resource: "image" | "video";
  uploadUrl: string;
}

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_VIDEO_BYTES = 100 * 1024 * 1024;

const ACCEPT = "image/jpeg,image/png,image/webp,image/avif,video/mp4,video/webm,video/quicktime";

/**
 * Direct-to-Cloudinary upload (§48): the API secret never leaves the
 * server — the browser signs via /api/media/sign, then POSTs the file to
 * Cloudinary and hands the secure URL back. Handles images AND videos;
 * the caller decides what to do with the URL (library shelf, product…).
 */
export default function MediaUploader({
  onUploaded,
  folder = "prosanti/products",
  compact = false,
}: {
  onUploaded: (url: string, label: string, kind: MediaKind) => void;
  folder?: string;
  compact?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const upload = async (file: File) => {
    setError(null);
    setStatus(null);
    const isVideo = file.type.startsWith("video/");
    const isImage = file.type.startsWith("image/");
    if (!isImage && !isVideo) {
      setError("Choose an image (JPG, PNG, WebP) or a video (MP4, WebM, MOV).");
      return;
    }
    const limit = isVideo ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
    if (file.size > limit) {
      setError(
        isVideo
          ? "That video is larger than 100 MB — compress it first."
          : "That image is larger than 10 MB — resize it first.",
      );
      return;
    }
    setBusy(true);
    setStatus("Requesting upload signature…");
    try {
      let sign: SignResponse;
      try {
        sign = await apiSend<SignResponse>("/api/media/sign", "POST", {
          folder,
          resource: isVideo ? "video" : "image",
        });
      } catch (err) {
        setError(
          err instanceof AdminApiError && err.status === 503
            ? "Cloudinary is not configured yet — add by URL below instead."
            : err instanceof AdminApiError
              ? err.message
              : "Could not start the upload.",
        );
        return;
      }
      setStatus(isVideo ? "Uploading video… (this can take a minute)" : "Uploading…");
      const form = new FormData();
      form.append("file", file);
      form.append("api_key", sign.apiKey);
      form.append("timestamp", String(sign.timestamp));
      form.append("folder", sign.folder);
      form.append("signature", sign.signature);
      const res = await fetch(sign.uploadUrl, { method: "POST", body: form });
      const data = (await res.json().catch(() => null)) as {
        secure_url?: string;
        resource_type?: string;
        error?: { message?: string };
      } | null;
      if (!res.ok || !data?.secure_url) {
        setError(data?.error?.message ?? "The upload failed — try again.");
        return;
      }
      const kind: MediaKind =
        data.resource_type === "video" || isVideo ? "video" : "image";
      onUploaded(
        data.secure_url,
        file.name.replace(/\.[a-z0-9]+$/i, ""),
        kind,
      );
      setStatus(
        kind === "video"
          ? "Video uploaded — added below."
          : "Uploaded — added below.",
      );
    } catch {
      setError("Could not reach the upload service — try again.");
    } finally {
      setBusy(false);
    }
  };

  if (compact) {
    return (
      <div>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="hidden"
          aria-label="Choose an image or video to upload"
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
          className="inline-flex items-center gap-2 rounded-xl bg-forest-800 px-4 py-2.5 text-sm font-semibold text-ivory-50 transition-colors hover:bg-forest-700 disabled:opacity-60"
        >
          <IconPlus className="h-4 w-4" />
          {busy ? "Uploading…" : "Upload image / video"}
        </button>
        {status && !error && (
          <p role="status" className="mt-2 text-xs font-medium text-emerald-700">
            {status}
          </p>
        )}
        {error && (
          <p role="alert" className="mt-2 text-xs font-medium text-rose-700">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-paper p-5 ring-1 ring-line">
      <p className="text-[0.7rem] font-semibold uppercase tracking-[0.2em] text-ink-soft">
        Upload to Cloudinary
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="hidden"
          aria-label="Choose an image or video to upload"
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
          {busy ? "Uploading…" : "Choose image or video"}
        </button>
        <p className="text-xs text-ink-soft">
          Images up to 10 MB · videos (MP4/WebM/MOV) up to 100 MB · lands in
          Cloudinary folder <span className="font-mono">{folder}</span>
        </p>
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
