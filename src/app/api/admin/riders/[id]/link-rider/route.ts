/**
 * Staff link-rider (marketplace phase 3, slice 6).
 * POST { email } → finds the Auth user and links it as this rider's login.
 * Works before approval too: rider API access unlocks when staff flips the
 * rider to active (the rider wrapper checks status, slice 8).
 */
import { staffRoute, routeId } from "../../../_lib";
import { getSupabaseService } from "@/lib/supabase-server";
import { AdminInputError } from "@/lib/db/admin";
import { apiJson } from "@/lib/api-response";

export const POST = staffRoute(
  "rider-link-rider",
  async ({ db }, request, routeContext) => {
    const id = await routeId(routeContext);
    if (!id) throw new AdminInputError("Rider not found.", 404);
    const body = (await request.json().catch(() => null)) as {
      email?: string;
    } | null;
    const email = (body?.email ?? "").trim().toLowerCase().slice(0, 160);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new AdminInputError("Enter a valid email address.");
    }
    const { data: rider, error: riderError } = await db
      .from("riders")
      .select("id,user_id")
      .eq("id", id)
      .single();
    if (riderError || !rider) {
      throw new AdminInputError("Rider not found.", 404);
    }
    const service = getSupabaseService();
    if (!service) {
      throw new AdminInputError("Service key is not configured.", 503);
    }
    const { data: listed, error: listError } =
      await service.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (listError) throw new Error("user lookup failed");
    const match = listed.users.find(
      (u) => (u.email ?? "").toLowerCase() === email,
    );
    if (!match) {
      throw new AdminInputError(
        "No account uses that email yet — ask the rider to sign up first.",
        404,
      );
    }

    const row = rider as { id: string; user_id: string | null };
    if (row.user_id === match.id) return apiJson({ linked: email });
    if (row.user_id) {
      throw new AdminInputError(
        "This rider already has a linked login.",
        409,
      );
    }
    const { data: used } = await db
      .from("riders")
      .select("id")
      .eq("user_id", match.id)
      .limit(1);
    if (used && used.length > 0) {
      throw new AdminInputError("That account is already a rider.", 409);
    }

    // The link itself goes through the RLS-bound staff client: the trigger
    // allows admin changes, while a service-role update runs without a
    // staff identity and would hit the rider self-update guard.
    const { error: linkError } = await db
      .from("riders")
      .update({ user_id: match.id })
      .eq("id", id);
    if (linkError) {
      if (linkError.code === "23505") {
        throw new AdminInputError("That account is already a rider.", 409);
      }
      throw new Error("rider link failed");
    }
    return apiJson({ linked: email });
  },
  { limit: 20 },
);
