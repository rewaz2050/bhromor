/**
 * Staff link-vendor (marketplace phase 2, slice 3).
 * POST { email } → finds the Auth user, inserts vendor_users as owner.
 * Works before approval too: the vendor's API access unlocks when staff
 * flips the shop to active (requireVendor enforces the status check).
 */
import { staffRoute, routeId } from "../../../_lib";
import { getSupabaseService } from "@/lib/supabase-server";
import { AdminInputError } from "@/lib/db/admin";
import { apiJson } from "@/lib/api-response";

export const POST = staffRoute(
  "shop-link-vendor",
  async ({ db }, request, routeContext) => {
    const id = await routeId(routeContext);
    const body = (await request.json().catch(() => null)) as {
      email?: string;
    } | null;
    const email = (body?.email ?? "").trim().toLowerCase().slice(0, 160);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new AdminInputError("Enter a valid email address.");
    }
    const { data: shop, error: shopError } = await db
      .from("shops")
      .select("id")
      .eq("id", id)
      .single();
    if (shopError || !shop) throw new AdminInputError("Shop not found.", 404);
    const service = getSupabaseService();
    if (!service) throw new AdminInputError("Service key is not configured.", 503);
    const { data: listed, error: listError } =
      await service.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (listError) throw new Error("user lookup failed");
    const match = listed.users.find(
      (u) => (u.email ?? "").toLowerCase() === email,
    );
    if (!match) {
      throw new AdminInputError(
        "No account uses that email yet — ask the vendor to sign up first.",
        404,
      );
    }
    const { error: linkError } = await service.from("vendor_users").insert({
      user_id: match.id,
      shop_id: id,
      role: "owner",
    });
    if (linkError) {
      if (linkError.code === "23505") {
        throw new AdminInputError("That account is already a vendor.", 409);
      }
      throw new Error("vendor link failed");
    }
    return apiJson({ linked: email });
  },
  { limit: 20 },
);
