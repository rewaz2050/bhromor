/**
 * POST /api/media/sign — Cloudinary signed-upload parameters (§48).
 *
 * Returns short-lived signature material so the admin media UI can upload
 * straight to Cloudinary without ever seeing the API secret. 503 until
 * Cloudinary is configured — the add-by-URL flow keeps working meanwhile.
 */

import { createHash } from "node:crypto";
import {
  cloudinaryApiKey,
  cloudinaryApiSecret,
  cloudinaryCloudName,
  isCloudinaryConfigured,
} from "@/lib/env";
import { checkRateLimit, clientIpFromHeaders } from "@/lib/rate-limit";
import { apiError, apiJson } from "@/lib/api-response";

export const dynamic = "force-dynamic";

const WINDOW_MS = 60_000;
const LIMIT = 30;

const sanitizeFolder = (value: unknown): string => {
  if (typeof value !== "string") return "prosanti/products";
  const cleaned = value.trim().toLowerCase().replace(/[^a-z0-9/_-]/g, "");
  return cleaned === "" ? "prosanti/products" : cleaned.slice(0, 80);
};

export async function POST(request: Request) {
  const ip = clientIpFromHeaders(request.headers);
  const limit = checkRateLimit(`media-sign:${ip}`, LIMIT, WINDOW_MS);
  if (!limit.allowed) {
    const res = apiError("Too many attempts — please wait a moment.", 429);
    res.headers.set("Retry-After", String(limit.retryAfterSec));
    return res;
  }

  if (!isCloudinaryConfigured()) {
    return apiError("Media uploads are not configured yet.", 503, {
      code: "NOT_CONFIGURED",
    });
  }

  let folder = "prosanti/products";
  try {
    folder = sanitizeFolder((await request.json())?.folder);
  } catch {
    // Empty/invalid body → default folder.
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const toSign = `folder=${folder}&timestamp=${timestamp}${cloudinaryApiSecret()}`;
  const signature = createHash("sha1").update(toSign).digest("hex");

  return apiJson({
    cloudName: cloudinaryCloudName(),
    apiKey: cloudinaryApiKey(),
    timestamp,
    folder,
    signature,
  });
}
