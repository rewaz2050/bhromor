/**
 * Shared body parsing for the live session routes (P1 #9).
 */
import {
  validateLiveSessionInput,
  type LiveSessionError,
  type LiveSessionInput,
  type ValidatedLiveSession,
} from "@/lib/live";
import { apiError } from "@/lib/api-response";
import type { SupabaseClient } from "@supabase/supabase-js";
import { liveCatalogProductIds } from "@/lib/db/live";

export interface ParsedSessionBody {
  value?: ValidatedLiveSession;
  errors?: LiveSessionError[];
}

/**
 * Parse + validate a create/update body. `productIds` are checked against
 * the REAL published catalog (live rows), never against the client's claim.
 */
export async function parseSessionBody(
  db: SupabaseClient,
  raw: unknown,
): Promise<ParsedSessionBody> {
  const b = (raw ?? {}) as Record<string, unknown>;
  const input: LiveSessionInput = {
    title: typeof b.title === "string" ? b.title : "",
    description: typeof b.description === "string" ? b.description : "",
    streamUrl: typeof b.streamUrl === "string" ? b.streamUrl : "",
    startsAt: typeof b.startsAt === "number" ? b.startsAt : Number.NaN,
    productIds: Array.isArray(b.productIds)
      ? (b.productIds as unknown[]).filter((x) => typeof x === "string")
      : [],
  };
  const known = await liveCatalogProductIds(db);
  return validateLiveSessionInput(input, known);
}

/** First field error → a 422 the admin UI can show. */
export const firstError = (parsed: ParsedSessionBody) =>
  parsed.errors?.length ? apiError(parsed.errors[0].message, 422) : null;
