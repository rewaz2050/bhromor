/**
 * GET /api/health — backend status probe.
 * Tells the storefront (and the deploy owner) whether Supabase/Cloudinary
 * are configured and reachable. Never leaks keys — booleans only.
 */

import { getSupabaseServer } from "@/lib/supabase-server";
import {
  isCloudinaryConfigured,
  isServiceRoleConfigured,
  isSupabaseConfigured,
} from "@/lib/env";
import { apiJson } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export async function GET() {
  const configured = isSupabaseConfigured();
  let reachable = false;
  if (configured) {
    try {
      const db = await getSupabaseServer();
      const probe = db
        ? await db.from("delivery_zones").select("id", { head: true, count: "exact" })
        : null;
      reachable = !probe?.error;
    } catch {
      reachable = false;
    }
  }
  return apiJson({
    mode: configured && reachable ? "live" : "demo",
    supabase: {
      configured,
      serviceConfigured: isServiceRoleConfigured(),
      reachable,
    },
    cloudinary: { configured: isCloudinaryConfigured() },
    now: new Date().toISOString(),
  });
}
