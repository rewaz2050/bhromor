/**
 * Staff link-vendor (marketplace phase 2, slice 3).
 * POST { email } or { phone } → finds the Auth user, inserts vendor_users as
 * owner. Works before approval too: the vendor's API access unlocks when
 * staff flips the shop to active (requireVendor enforces the status check).
 *
 * 2026-09-27 (B10): the mobile number works too. Every applicant who left
 * the e-mail empty signed in with a synthetic `<phone>@…` address, and the
 * old e-mail-only form made those shops impossible to link from the panel.
 */
import { staffRoute, routeId } from "../../../_lib";
import { getSupabaseService } from "@/lib/supabase-server";
import { AdminInputError } from "@/lib/db/admin";
import { asciiDigits, isPlausibleBdPhone, normalizeBdPhone } from "@/lib/phone";
import { describeLoginEmail, phoneLoginEmail } from "@/lib/phone-login";
import { apiJson } from "@/lib/api-response";
import { CACHE_TAG_SHOPS, revalidateCatalogCaches } from "@/lib/public-cache";

/** Admin/super_admin only — see the permission matrix in docs/SECURITY-HARDENING.md. */
const ADMIN_ONLY = ["admin", "super_admin"] as const;

export const POST = staffRoute(
  "shop-link-vendor",
  async ({ db }, request, routeContext) => {
    const id = await routeId(routeContext);
    const body = (await request.json().catch(() => null)) as {
      email?: string;
      phone?: string;
    } | null;
    const email = (body?.email ?? "").trim().toLowerCase().slice(0, 160);
    const typedPhone = (body?.phone ?? "").trim();
    let lookup = email;
    let byPhone = false;
    if (typedPhone !== "") {
      const phone = normalizeBdPhone(asciiDigits(typedPhone));
      if (!isPlausibleBdPhone(phone)) {
        throw new AdminInputError("Enter a valid mobile number (01XXXXXXXXX).");
      }
      lookup = phoneLoginEmail(phone);
      byPhone = true;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new AdminInputError("Enter the vendor's email address or mobile number.");
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
      (u) => (u.email ?? "").toLowerCase() === lookup,
    );
    if (!match) {
      throw new AdminInputError(
        byPhone
          ? "No account uses that mobile number yet — ask the vendor to apply or sign up first."
          : "No account uses that email yet — ask the vendor to sign up first.",
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
    revalidateCatalogCaches(CACHE_TAG_SHOPS);
    return apiJson({ linked: describeLoginEmail(lookup), email: lookup });
  },
  { limit: 20, roles: ADMIN_ONLY },
);
