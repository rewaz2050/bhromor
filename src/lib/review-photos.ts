/**
 * Review photos (P1 #10 — customer photos / UGC).
 *
 * A photo of the garment on a real body answers "will it fit me?" better
 * than any description — that is the whole differentiator versus a food
 * app. The rules here keep the feature honest:
 *
 *   • Photos are JPEG data URLs, compressed in the browser before they ever
 *     leave it (≤ MAX_DIM longest side, quality 0.78) — a 12MP phone photo
 *     must not arrive as a 6MB payload.
 *   • At most MAX_PHOTOS per review, each ≤ MAX_PHOTO_CHARS characters of
 *     data URL (~1.1MB of image) — the DB column's check constraint is the
 *     second gate; the server never trusts the client's word on either.
 *   • When Cloudinary is configured the server re-hosts the JPEG in the
 *     project's own namespace (prosanti/reviews) and stores the URL; when it
 *     is not, the compressed data URL is stored as-is (launch scale). A
 *     failed re-host falls back to the data URL — a review is never lost
 *     because the image service hiccuped.
 */

import {
  cloudinaryApiKey,
  cloudinaryApiSecret,
  cloudinaryCloudName,
  isCloudinaryConfigured,
} from "./env";

export const MAX_PHOTOS = 3;
/** Longest side of the client-compressed JPEG. */
export const MAX_DIM = 1080;
/** Quality hint for the client JPEG encoder. */
export const JPEG_QUALITY = 0.78;
/**
 * Data-URL character budget per photo (base64 inflates ~4/3, so this is
 * ~1.12MB of image bytes). Kept under the DB check constraint headroom.
 */
export const MAX_PHOTO_CHARS = 1_200_000;

/** The exact shape a browser-compressed JPEG data URL has. */
export const isReviewPhotoDataUrl = (value: unknown): value is string =>
  typeof value === "string" &&
  /^data:image\/jpeg;base64,[A-Za-z0-9+/=\r\n]+$/.test(value) &&
  value.length <= MAX_PHOTO_CHARS;

/**
 * Server-side gate over whatever the client sent: keeps at most
 * MAX_PHOTOS, in order, and only ones that genuinely look like our
 * compressed JPEGs (or an https URL we might have re-hosted before —
 * accepted read-only, never written). Returns [] when nothing usable.
 */
export const sanitizeReviewPhotos = (
  raw: unknown,
): { dataUrls: string[] } => {
  if (!Array.isArray(raw)) return { dataUrls: [] };
  const out: string[] = [];
  for (const entry of raw) {
    if (typeof entry === "string" && entry.startsWith("data:image/jpeg;base64,")) {
      const value = entry.replace(/[\r\n]/g, "");
      if (
        value.length >= 200 &&
        value.length <= MAX_PHOTO_CHARS &&
        /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(value)
      ) {
        out.push(value);
      }
      if (out.length === MAX_PHOTOS) break;
      continue;
    }
    if (typeof entry === "string" && /^https:\/\/[^\s]+\.(?:jpg|jpeg|webp)(\?.*)?$/.test(entry)) {
      // Only ever happens if a client re-sends an already-stored URL;
      // harmless to keep, still bounded by MAX_PHOTOS.
      out.push(entry.slice(0, 2048));
    }
  }
  if (out.length > MAX_PHOTOS) return { dataUrls: out.slice(0, MAX_PHOTOS) };
  return { dataUrls: out };
};

/**
 * Re-host one compressed JPEG on Cloudinary (server-side REST upload).
 * Returns the public URL, or null when Cloudinary is not configured or the
 * upload fails — the caller then keeps the data URL (honest fallback).
 * Server-only: reads the service credentials from env, never from a client.
 */
export async function uploadReviewPhotoToCloudinary(
  dataUrl: string,
): Promise<string | null> {
  if (!isCloudinaryConfigured()) return null;
  const cloudName = cloudinaryCloudName();
  if (!cloudName) return null;
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  try {
    const res = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudName}/image_upload`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          file: `data:image/jpeg;base64,${base64}`,
          folder: "prosanti/reviews",
          api_key: cloudinaryApiKey() ?? "",
          api_secret: cloudinaryApiSecret() ?? "",
          public_id_prefix: `review-${Date.now()}`,
        }),
      },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { secure_url?: string };
    return typeof data.secure_url === "string" ? data.secure_url : null;
  } catch {
    return null;
  }
}

/**
 * Store one review's photos: re-host what Cloudinary takes, keep the data
 * URL for the rest. Never throws — a photo problem degrades to "fewer
 * photos", not a lost review.
 */
export async function storeReviewPhotos(
  dataUrls: string[],
): Promise<string[]> {
  const urls: string[] = [];
  for (const dataUrl of dataUrls) {
    const hosted = await uploadReviewPhotoToCloudinary(dataUrl);
    urls.push(hosted ?? dataUrl);
  }
  return urls;
}

/** Attach photo URL lists (by review id) to already-mapped reviews. */
export const attachReviewPhotos = <T extends { id: string }>(
  reviews: T[],
  photosByReview: Map<string, string[]>,
): (T & { photos: string[] })[] =>
  reviews.map((r) => ({
    ...r,
    photos: photosByReview.get(r.id) ?? [],
  }));

/** Client-side: shrink + re-encode one image file to the review JPEG budget. */
export interface CompressedPhoto {
  dataUrl: string;
  /** Approximate output size in bytes. */
  bytes: number;
}

/**
 * Browser-only. Reads a picked image file, draws it onto a canvas capped at
 * MAX_DIM on the longest side and exports JPEG at JPEG_QUALITY. Returns null
 * when the input is not an image or encoding fails — the picker then tells
 * the shopper honestly instead of sending garbage.
 */
export async function compressReviewPhoto(
  file: File,
  maxDim: number = MAX_DIM,
  quality: number = JPEG_QUALITY,
): Promise<CompressedPhoto | null> {
  if (typeof window === "undefined" || typeof file === "undefined") return null;
  if (!file.type.startsWith("image/")) return null;
  let objectUrl: string | null = null;
  try {
    if (typeof URL.createObjectURL !== "function") return null;
    const objectUrlLive = URL.createObjectURL(file);
    objectUrl = objectUrlLive;
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("decode failed"));
      el.src = objectUrlLive;
    });
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, w, h);
    const dataUrl = canvas.toDataURL("image/jpeg", quality);
    return { dataUrl, bytes: Math.round((dataUrl.length * 3) / 4) };
  } catch {
    return null;
  } finally {
    if (objectUrl && typeof URL.revokeObjectURL === "function") {
      URL.revokeObjectURL(objectUrl);
    }
  }
}
