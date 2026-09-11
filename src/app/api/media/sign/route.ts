/**
 * POST /api/media/sign — Cloudinary signed-upload parameters (§48).
 *
 * Staff-only: returns short-lived signature material so the admin media UI
 * (and the product editor) can upload straight to Cloudinary without ever
 * seeing the API secret. 503 until Cloudinary is configured — the
 * add-by-URL flow keeps working meanwhile.
 *
 * Body: { folder?: string, resource?: "image" | "video" }
 * Folders are allow-listed to prosanti/* so staff uploads always land in
 * the project's own namespace.
 */

import { createHash } from "node:crypto";
import {
  cloudinaryApiKey,
  cloudinaryApiSecret,
  cloudinaryCloudName,
  isCloudinaryConfigured,
} from "@/lib/env";
import { apiError, apiJson } from "@/lib/api-response";
import { staffRoute } from "@/app/api/admin/_lib";

export const dynamic = "force-dynamic";

const FOLDER_RE = /^[a-z0-9][a-z0-9/_-]{0,79}$/;

const sanitizeFolder = (value: unknown): string => {
  const fallback = "prosanti/products";
  if (typeof value !== "string") return fallback;
  const cleaned = value.trim().toLowerCase().replace(/[^a-z0-9/_-]/g, "");
  if (!FOLDER_RE.test(cleaned)) return fallback;
  // Staff uploads stay inside the project namespace.
  if (!cleaned.startsWith("prosanti/")) return fallback;
  return cleaned;
};

export const POST = staffRoute(
  "media:sign",
  async (_staff, request) => {
    if (!isCloudinaryConfigured()) {
      return apiError("Media uploads are not configured yet.", 503, {
        code: "NOT_CONFIGURED",
      });
    }

    let folder = "prosanti/products";
    let resource: "image" | "video" = "image";
    try {
      const body = (await request.json()) as {
        folder?: unknown;
        resource?: unknown;
      };
      folder = sanitizeFolder(body?.folder);
      if (body?.resource === "video") resource = "video";
    } catch {
      // Empty/invalid body → default folder, image upload.
    }

    const timestamp = Math.floor(Date.now() / 1000);
    const toSign = `folder=${folder}&timestamp=${timestamp}${cloudinaryApiSecret()}`;
    const signature = createHash("sha1").update(toSign).digest("hex");
    const cloudName = cloudinaryCloudName();

    return apiJson({
      cloudName,
      apiKey: cloudinaryApiKey(),
      timestamp,
      folder,
      signature,
      resource,
      uploadUrl: `https://api.cloudinary.com/v1_1/${cloudName}/${resource}/upload`,
    });
  },
  { limit: 30 },
);
