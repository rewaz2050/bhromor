import { apiJson } from "@/lib/api-response";
import { RiderInputError, setRiderAvailability } from "@/lib/db/riders";
import { riderRoute } from "../_lib";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/rider/availability — P2 #22. A rider keeps their own shift
 * (hours + days, Asia/Dhaka); the dispatcher's own SQL honours it, so this
 * one write is the whole feature for the rider. `always` clears both bounds.
 */
export const PATCH = riderRoute(
  "availability",
  async (ctx, request) => {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      throw new RiderInputError("Send the shift you want to keep.", 422);
    }
    const availability = await setRiderAvailability(
      ctx.service,
      ctx.rider.id,
      body,
    );
    return apiJson({ availability });
  },
  { limit: 20 },
);
