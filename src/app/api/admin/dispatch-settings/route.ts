/**
 * Staff → dispatch rules (J, 202610020003).
 * GET — current cash cap / offer window / max attempts (defaults when unset).
 * PATCH — save all three (strict: out-of-range is refused, never silently clamped).
 * Writes go through the staff member's own client so RLS ("admin all settings")
 * and the money-audit trigger see the real actor.
 */
import { apiJson } from "@/lib/api-response";
import { readDispatchSettings, writeDispatchSettings } from "@/lib/db/dispatch-settings";
import { staffRoute } from "../_lib";

export const dynamic = "force-dynamic";

export const GET = staffRoute("dispatch-settings", async ({ db }) => {
  return apiJson({ settings: await readDispatchSettings(db) });
});

export const PATCH = staffRoute(
  "dispatch-settings-save",
  async ({ db }, request) => {
    const body = (await request.json().catch(() => null)) as { settings?: unknown } | null;
    const settings = await writeDispatchSettings(db, body?.settings ?? body ?? {});
    return apiJson({ settings });
  },
  { limit: 20 },
);
