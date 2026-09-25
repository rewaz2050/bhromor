import { apiJson } from "@/lib/api-response";
import { riderRoute } from "../_lib";

export const dynamic = "force-dynamic";

/** GET /api/rider/me — authenticated rider session probe. */
export const GET = riderRoute("me", async (ctx) => {
  return apiJson({
    rider: ctx.rider,
    email: ctx.email,
  });
});
