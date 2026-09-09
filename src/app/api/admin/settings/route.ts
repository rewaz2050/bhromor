/**
 * Staff ops settings (§58).
 * GET /api/admin/settings — { lowStockThreshold }.
 * PATCH /api/admin/settings { lowStockThreshold } — saved to
 * site_settings['ops']; dashboard + inventory alerts use it live.
 */

import { readOpsSettings, writeOpsSettings } from "@/lib/db/engagement";
import { apiError, apiJson } from "@/lib/api-response";
import { staffRoute } from "../_lib";

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
  return apiJson({ settings });
});
