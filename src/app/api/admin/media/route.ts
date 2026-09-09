/**
 * Staff media library (§49) — the persistent "added" shelf.
 * GET /api/admin/media — library rows, newest first (the page merges them
 * with the in-use scan from the catalog).
 * POST /api/admin/media { url, alt?, label? } — add a hosted URL.
 * DELETE /api/admin/media?id=… — remove one.
 */

import {
  addMediaLibrary,
  deleteMediaLibrary,
  listMediaLibrary,
} from "@/lib/db/engagement";
import { apiError, apiJson } from "@/lib/api-response";
import { staffRoute } from "../_lib";

export const dynamic = "force-dynamic";

export const GET = staffRoute("media-list", async ({ db }) => {
  const items = await listMediaLibrary(db);
  return apiJson({ items });
});

export const POST = staffRoute("media-add", async ({ db }, request) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Invalid image.", 400);
  }
  const item = await addMediaLibrary(db, body);
  return apiJson({ item }, 201);
});

export const DELETE = staffRoute("media-delete", async ({ db }, request) => {
  const id = new URL(request.url).searchParams.get("id") ?? "";
  await deleteMediaLibrary(db, id);
  return apiJson({ deleted: true as const });
});
