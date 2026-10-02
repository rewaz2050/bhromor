/**
 * Staff → rider incentives (item V, 202610020010).
 * GET   — the current settings (all off by default).
 * PATCH — { dailyTarget, dailyBonusTaka, referralBonusTaka, referralAfter }.
 *         Admin / super-admin only: it decides what the platform pays.
 *         Written through the staff member's own client so RLS and the money
 *         audit trigger see the real actor.
 */
import { apiJson } from "@/lib/api-response";
import { readIncentiveSettings, writeIncentiveSettings } from "@/lib/db/rider-incentives";
import { staffRoute } from "../../_lib";

export const dynamic = "force-dynamic";

export const GET = staffRoute("rider-incentives", async ({ db }) => apiJson({ settings: await readIncentiveSettings(db) }));

export const PATCH = staffRoute(
  "rider-incentives-save",
  async ({ db }, request) => {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    return apiJson({ settings: await writeIncentiveSettings(db, body ?? {}) });
  },
  { limit: 20, roles: ["admin", "super_admin"] },
);
