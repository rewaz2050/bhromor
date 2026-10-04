/**
 * Staff → peak-hour / rainy-day delivery bonus (202610020015).
 * GET   — the current settings (all off by default).
 * PATCH — { peakBonusTaka, peakStartHour, peakEndHour, rainBonusTaka }.
 *         Admin / super-admin only: it decides what the platform pays. Written through
 *         the staff member's own client so RLS and the money audit trigger see the real actor.
 */
import { apiJson } from "@/lib/api-response";
import { readOrderBonusSettings, writeOrderBonusSettings } from "@/lib/db/rider-order-bonus";
import { staffRoute } from "../../_lib";

export const dynamic = "force-dynamic";

export const GET = staffRoute("rider-order-bonus", async ({ db }) => apiJson({ settings: await readOrderBonusSettings(db) }));

export const PATCH = staffRoute(
  "rider-order-bonus-save",
  async ({ db }, request) => {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    return apiJson({ settings: await writeOrderBonusSettings(db, body ?? {}) });
  },
  { limit: 20, roles: ["admin", "super_admin"] },
);
