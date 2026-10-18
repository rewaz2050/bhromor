/**
 * Cloudinary signed-upload parameters (§48), shared by the staff media
 * route (/api/media/sign) and the rider proof-photo route
 * (/api/rider/media/sign). The API secret never leaves the server: the
 * browser gets a short-lived signature and posts the file straight to
 * Cloudinary.
 */

import { createHash } from "node:crypto";
import {
  cloudinaryApiKey,
  cloudinaryApiSecret,
  cloudinaryCloudName,
} from "@/lib/env";

const FOLDER_RE = /^[a-z0-9][a-z0-9/_-]{0,79}$/;

/** Uploads always land inside the project namespace (prosanti/…). */
export const sanitizeCloudinaryFolder = (
  value: unknown,
  fallback = "prosanti/products",
): string => {
  if (typeof value !== "string") return fallback;
  const cleaned = value.trim().toLowerCase().replace(/[^a-z0-9/_-]/g, "");
  if (!FOLDER_RE.test(cleaned)) return fallback;
  if (!cleaned.startsWith("prosanti/")) return fallback;
  return cleaned;
};

export interface CloudinarySignature {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  folder: string;
  signature: string;
  resource: "image" | "video";
  allowedFormats: string;
  /** Round 4: signed upload cap — 10 MB images, 100 MB videos. */
  maxFileSize: number;
  uploadUrl: string;
}

/** Caller must have checked isCloudinaryConfigured(). */
export const signCloudinaryUpload = (
  folder: string,
  resource: "image" | "video" = "image",
): CloudinarySignature => {
  const timestamp = Math.floor(Date.now() / 1000);
  // Phase 1B.4 (F-16, 2026-10-18): KYC is image-only, 8 MB, strict allowlist;
  // other surfaces keep their previous cap but also stay image+video separated.
  const allowedFormats = resource === "image" ? "jpg,jpeg,png,webp,heic,avif" : "mov,mp4,webm";
  const maxFileSize = resource === "image"
    ? (folder === "prosanti/rider-kyc" ? 8_000_000 : 10_000_000)
    : 100_000_000;
  // Cloudinary signs the params alphabetically; max_file_size must be sent
  // back with the upload or the signature will not match.
  const toSign = `allowed_formats=${allowedFormats}&folder=${folder}&max_file_size=${maxFileSize}&timestamp=${timestamp}${cloudinaryApiSecret() ?? ""}`;
  const signature = createHash("sha1").update(toSign).digest("hex");
  const cloudName = cloudinaryCloudName() ?? "";
  return {
    cloudName,
    apiKey: cloudinaryApiKey() ?? "",
    timestamp,
    folder,
    signature,
    resource,
    allowedFormats,
    maxFileSize,
    uploadUrl: `https://api.cloudinary.com/v1_1/${cloudName}/${resource}/upload`,
  };
};
