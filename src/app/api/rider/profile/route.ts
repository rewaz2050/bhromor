import { riderRoute } from "../_lib";
import { apiError, apiJson } from "@/lib/api-response";
import { ProfileInputError, riderProfileInput } from "@/lib/profile-input";
import { mapRider } from "@/lib/db/mappers";
import { withoutReview } from "@/lib/shop-utils";
import type { DbRider } from "@/lib/db/types";

export const dynamic = "force-dynamic";
export const PATCH = riderRoute("profile", async (ctx, request) => {
  if (request.headers.get("sec-fetch-site") === "cross-site") return apiError("Forbidden", 403);
  try {
    const patch = riderProfileInput(await request.json().catch(() => null));
    const { data, error } = await ctx.service.from("riders").update(patch)
      .eq("id", ctx.rider.id).select("*").single();
    if (error?.code === "23505") return apiError("এই ফোন নম্বর অন্য রাইডারের আছে।", 409);
    if (error || !data) return apiError("প্রোফাইল সেভ হয়নি—আবার চেষ্টা করুন।", 503);
    return apiJson({ rider: withoutReview(mapRider(data as DbRider)) });
  } catch (err) {
    if (err instanceof ProfileInputError) return apiError(err.message, 422);
    throw err;
  }
}, { limit: 20 });
