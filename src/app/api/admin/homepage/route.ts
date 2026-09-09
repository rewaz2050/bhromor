/**
 * Staff homepage CMS (§31).
 * GET /api/admin/homepage — the published settings row (or defaults).
 * PATCH /api/admin/homepage { settings } — publish; the storefront picks
 * it up from GET /api/homepage.
 */

import {
  readHomepageSetting,
  writeHomepageSetting,
} from "@/lib/db/engagement";
import { apiError, apiJson } from "@/lib/api-response";
import { staffRoute } from "../_lib";

export const dynamic = "force-dynamic";

export const GET = staffRoute("homepage-read", async ({ db }) => {
  const settings = await readHomepageSetting(db);
  return apiJson({ settings });
});

export const PATCH = staffRoute("homepage-write", async ({ db }, request) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Invalid settings.", 400);
  }
  const settings = await writeHomepageSetting(
    db,
    (body as Record<string, unknown> | null)?.settings ?? body,
  );
  return apiJson({ settings });
});
