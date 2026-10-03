import { apiJson } from "@/lib/api-response";
import { readFailedProofMode } from "@/lib/db/failed-proof";
import { isCloudinaryConfigured } from "@/lib/env";
import { riderRoute } from "../_lib";

export const dynamic = "force-dynamic";

/**
 * GET /api/rider/failed-proof — does the failed-attempt form ask for a photo?
 * { mode: 0 | 1 | 2, uploads: boolean }. Read with the service client (the rider cannot read
 * site_settings); the answer is the same for every rider and holds nothing secret.
 */
export const GET = riderRoute("failed-proof-mode", async (ctx) =>
  apiJson({ mode: await readFailedProofMode(ctx.service), uploads: isCloudinaryConfigured() }),
);
