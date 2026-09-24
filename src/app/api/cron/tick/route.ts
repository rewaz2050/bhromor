/**
 * /api/cron/tick — the shop's clock (2026-09-24).
 *
 * Called every 15 minutes by `.github/workflows/cron.yml` (free on a public
 * repo, no Vercel Pro needed — see docs/automation.md) and by the owner's own
 * `curl` when something needs nudging. GET and POST are the same thing so any
 * scheduler, uptime pinger or browser tab can trigger it.
 *
 * Gated by `CRON_SECRET` (header `x-cron-secret`, or `Authorization: Bearer`),
 * compared in constant time. The body is the honest report of what ran:
 *
 *   { "at": "...", "jobs": [{ "job": "delivery-reminders", "status": "ran", ... }] }
 *
 * Unconfigured (`CRON_SECRET` unset) answers 503 with `configured: false`
 * rather than pretending a tick happened — the same honest-off rule the push
 * endpoints follow.
 */

import { createHash, timingSafeEqual } from "node:crypto";
import { apiError, apiJson } from "@/lib/api-response";
import { isServiceRoleConfigured } from "@/lib/env";
import { getSupabaseService } from "@/lib/supabase-server";
import { runCronTick } from "@/lib/cron";

export const dynamic = "force-dynamic";
/** A busy tick (expiring offers + a fan-out) still finishes well inside this. */
export const maxDuration = 60;

/** Length-independent compare, so a wrong guess leaks nothing but a 401. */
const secretMatches = (given: string, expected: string): boolean => {
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
};

const presentedSecret = (request: Request): string => {
  const header = request.headers.get("x-cron-secret");
  if (header && header.trim() !== "") return header.trim();
  const auth = request.headers.get("authorization") ?? "";
  const bearer = /^Bearer\s+(.+)$/i.exec(auth.trim());
  return bearer?.[1]?.trim() ?? "";
};

const tick = async (request: Request) => {
  const expected = (process.env.CRON_SECRET ?? "").trim();
  if (expected === "") {
    return apiError(
      "Scheduler bondho — Vercel env e CRON_SECRET set koren (docs/automation.md).",
      503,
      { configured: false },
    );
  }
  if (!secretMatches(presentedSecret(request), expected)) {
    return apiError("Unauthorized.", 401, { configured: true });
  }
  if (!isServiceRoleConfigured()) {
    return apiError("SUPABASE_SERVICE_ROLE_KEY nai — tick cholte parbe na.", 503, {
      configured: true,
    });
  }
  const service = getSupabaseService();
  if (!service) {
    return apiError("SUPABASE_SERVICE_ROLE_KEY nai — tick cholte parbe na.", 503, {
      configured: true,
    });
  }
  const result = await runCronTick({ service });
  return apiJson(result);
};

export const GET = tick;
export const POST = tick;
