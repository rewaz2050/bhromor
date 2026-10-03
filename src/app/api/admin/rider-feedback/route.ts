/**
 * GET /api/admin/rider-feedback?max=3&only=1 — customers' delivery ratings with
 * their reasons and words, newest first (item X). `max` limits to ratings of
 * that many stars or fewer; `only=1` keeps rows that carry tags/words.
 * `ready:false` until 202610020009 is run.
 */
import { apiJson } from "@/lib/api-response";
import { listFeedbackForStaff } from "@/lib/db/delivery-feedback";
import { getSupabaseService } from "@/lib/supabase-server";
import { staffRoute } from "../_lib";

export const dynamic = "force-dynamic";

export const GET = staffRoute(
  "rider-feedback",
  async (_ctx, request) => {
    const url = new URL(request.url);
    const maxRaw = Number.parseInt(url.searchParams.get("max") ?? "", 10);
    const maxStars = Number.isFinite(maxRaw) ? Math.min(5, Math.max(1, maxRaw)) : 5;
    const service = getSupabaseService();
    if (!service) return apiJson({ ready: false, items: [] });
    const items = await listFeedbackForStaff(service, {
      maxStars,
      onlyWithFeedback: url.searchParams.get("only") === "1",
    });
    return apiJson({ ready: items !== null, items: items ?? [] });
  },
  { limit: 60 },
);
