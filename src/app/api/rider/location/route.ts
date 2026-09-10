import { apiJson, apiError } from "@/lib/api-response";
import { riderRoute } from "../_lib";
import { getSupabaseService } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

/** PATCH /api/rider/location — update rider lat/lng */
export const PATCH = riderRoute(
  "location",
  async (ctx, request) => {
    const body = (await request.json().catch(() => null)) as { lat?: unknown; lng?: unknown } | null;
    const lat = typeof body?.lat === "number" ? body.lat : typeof body?.lat === "string" ? parseFloat(body.lat) : NaN;
    const lng = typeof body?.lng === "number" ? body.lng : typeof body?.lng === "string" ? parseFloat(body.lng) : NaN;
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return apiError("Invalid coordinates", 422);
    }
    // Use RPC for security
    const { error } = await ctx.db.rpc("ps_rider_update_location", {
      p_lat: lat,
      p_lng: lng,
    });
    if (error) return apiError(error.message, 422);
    return apiJson({ ok: true, lat, lng });
  },
);

/** GET /api/rider/location — for debugging */
export const GET = riderRoute(
  "location:get",
  async (ctx) => {
    const db = getSupabaseService();
    if (!db) return apiError("Not configured", 503);
    // Return own rider location
    const { data, error } = await db.from("riders").select("id,lat,lng,last_location_at,current_load").eq("id", ctx.rider.id).single();
    if (error) return apiError("Not found", 404);
    return apiJson({ rider: data });
  },
);
