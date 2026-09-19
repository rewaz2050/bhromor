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
  uploadUrl: string;
}

/** Caller must have checked isCloudinaryConfigured(). */
export const signCloudinaryUpload = (
  folder: string,
  resource: "image" | "video" = "image",
): CloudinarySignature => {
  const timestamp = Math.floor(Date.now() / 1000);
  const toSign = `folder=${folder}&timestamp=${timestamp}${cloudinaryApiSecret() ?? ""}`;
  const signature = createHash("sha1").update(toSign).digest("hex");
  const cloudName = cloudinaryCloudName() ?? "";
  return {
    cloudName,
    apiKey: cloudinaryApiKey() ?? "",
    timestamp,
    folder,
    signature,
    resource,
    uploadUrl: `https://api.cloudinary.com/v1_1/${cloudName}/${resource}/upload`,
  };
};
