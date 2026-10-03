/**
 * Staff → rider scorecards (item M, 202610020006).
 * GET   — every active rider ranked worst-first, plus the auto-suspend switch
 *         and the rules it acts on. `ready:false` until the migration runs.
 * PATCH — { autoSuspend: boolean } flips the opt-in auto-suspend sweep.
 */
import { apiError, apiJson } from "@/lib/api-response";
import { readDispatchSettings } from "@/lib/db/dispatch-settings";
import { getScorecards, readAutoSuspend, writeAutoSuspend } from "@/lib/db/rider-quality";
import { AUTO_SUSPEND, QUALITY, rankScorecards } from "@/lib/rider-quality";
import { staffRoute } from "../../_lib";

export const dynamic = "force-dynamic";

export const GET = staffRoute(
  "rider-scorecards",
  async ({ db }) => {
    const [cards, autoSuspend, { cashCap }] = await Promise.all([
      getScorecards(db),
      readAutoSuspend(db),
      readDispatchSettings(db),
    ]);
    if (cards === null) return apiJson({ ready: false, riders: [], autoSuspend, rules: AUTO_SUSPEND, thresholds: QUALITY });
    return apiJson({
      ready: true,
      riders: rankScorecards(cards, cashCap),
      autoSuspend,
      rules: AUTO_SUSPEND,
      thresholds: QUALITY,
    });
  },
  { limit: 60 },
);

export const PATCH = staffRoute(
  "rider-scorecards-policy",
  async ({ db }, request) => {
    const body = (await request.json().catch(() => null)) as { autoSuspend?: unknown } | null;
    if (!body || typeof body.autoSuspend !== "boolean") return apiError("autoSuspend must be true or false.", 422);
    return apiJson({ autoSuspend: await writeAutoSuspend(db, body.autoSuspend) });
  },
  { limit: 20 },
);
