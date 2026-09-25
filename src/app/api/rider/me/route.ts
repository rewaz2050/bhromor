import { apiError, apiJson } from "@/lib/api-response";
import { mapRider } from "@/lib/db/mappers";
import type { DbRider } from "@/lib/db/types";
import { tryAutoLinkRider } from "@/lib/rider-auth";
import { getSupabaseServer, getSupabaseService } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

/**
 * GET /api/rider/me — authenticated rider session probe.
 *
 * Lenient by design (2026-09-25): unlike the job routes behind
 * `riderRoute`, this probe returns 200 for PENDING and SUSPENDED riders too,
 * so the /rider shell can paint "awaiting approval" instead of bouncing a
 * signed-in applicant back to /rider/login in an infinite loop. Only a
 * missing session is 401, and a signed-in account with no rider row at all
 * is 403 + NO_RIDER (the shell then points at /rider/apply).
 */
export async function GET() {
  const server = await getSupabaseServer();
  if (!server) {
    return apiError("Rider sign-in is not configured.", 401, {
      code: "NOT_CONFIGURED",
    });
  }
  const { data, error } = await server.auth.getUser();
  if (error || !data.user) {
    return apiError("Please sign in again.", 401, { code: "NO_SESSION" });
  }

  const { data: row } = await server
    .from("riders")
    .select("*")
    .eq("user_id", data.user.id)
    .maybeSingle();
  if (row) {
    return apiJson({
      rider: mapRider(row as DbRider),
      email: data.user.email ?? "",
    });
  }

  // Applied before signing up? The anonymous application carries the same
  // contact email — link it now so the applicant is not locked out.
  const email = data.user.email ?? "";
  const service = getSupabaseService();
  const linked =
    service && email
      ? await tryAutoLinkRider(service, data.user.id, email)
      : null;
  if (linked) {
    return apiJson({
      rider: mapRider(linked),
      email,
      linked: true as const,
    });
  }

  return apiError(
    "This account has no rider application yet — apply first, then sign in with the same email.",
    403,
    { code: "NO_RIDER" },
  );
}
