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
 * the project's own namespace. Riders use /api/rider/media/sign.
 */

import { isCloudinaryConfigured } from "@/lib/env";
import { apiError, apiJson } from "@/lib/api-response";
import { staffRoute } from "@/app/api/admin/_lib";
import {
  sanitizeCloudinaryFolder,
  signCloudinaryUpload,
} from "@/lib/cloudinary-sign";

export const dynamic = "force-dynamic";

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
      folder = sanitizeCloudinaryFolder(body?.folder);
      if (body?.resource === "video") resource = "video";
    } catch {
      // Empty/invalid body → default folder, image upload.
    }

    return apiJson(signCloudinaryUpload(folder, resource));
  },
  { limit: 30 },
);
