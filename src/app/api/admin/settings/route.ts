/**
 * Staff ops settings (§58).
 * GET /api/admin/settings — { lowStockThreshold }.
 * PATCH /api/admin/settings { lowStockThreshold } — saved to
 * site_settings['ops']; dashboard + inventory alerts use it live.
 */

import { readOpsSettings, writeOpsSettings } from "@/lib/db/engagement";
import { apiError, apiJson } from "@/lib/api-response";
import { CACHE_TAG_OPS, revalidateCatalogCaches } from "@/lib/public-cache";
import { staffRoute } from "../_lib";

/** Admin/super_admin only — see the permission matrix in docs/SECURITY-HARDENING.md. */
const ADMIN_ONLY = ["admin", "super_admin"] as const;

export const dynamic = "force-dynamic";

export const GET = staffRoute("settings-read", async ({ db }) => {
  const settings = await readOpsSettings(db);
  return apiJson({ settings });
});

export const PATCH = staffRoute("settings-write", async ({ db }, request) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Invalid settings.", 400);
  }
  const settings = await writeOpsSettings(db, body);
  revalidateCatalogCaches(CACHE_TAG_OPS);
  return apiJson({ settings });
}, { roles: ADMIN_ONLY });
