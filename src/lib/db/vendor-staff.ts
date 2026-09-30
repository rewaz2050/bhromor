/**
 * C1 (2026-09-28) — the shop's own staff logins (data access).
 *
 * Every helper starts from the same three facts: the caller is the shop's
 * OWNER, the row belongs to THEIR shop, and a staff login stays a staff login.
 * The database enforces all three as well (policies + trigger), so a bug in a
 * screen cannot promote anybody — but the checks live here too, because a
 * 403 with a sentence beats a policy error the shop cannot read.
 *
 * Two decisions worth stating:
 *
 *   • A login is never deleted. Revoking removes the shop's ACCESS (the
 *     `vendor_users` row); the person's account may be a customer's or a
 *     rider's too, and deleting it would take their parcels with it.
 *
 *   • An e-mail or number that ALREADY has a PROSANTI login is never adopted.
 *     The owner cannot prove it is the assistant's (we have no e-mail or SMS
 *     step), and adopting it would hand a stranger's account the keys to this
 *     shop. It is refused with what to do instead.
 */

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { AdminInputError } from "./admin";
import { mapVendorStaff } from "./mappers";
import {
  deleteApplicantAccount,
  generateTemporaryPassword,
  setApplicantPassword,
} from "./applicant-account";
import {
  VENDOR_STAFF_MAX,
  validateStaffInput,
  type VendorStaffMember,
  type VendorStaffRole,
} from "../vendor-staff";
import type { DbVendorUser } from "./types";

/** 403 unless the caller owns the shop — the one gate every helper shares. */
function assertOwner(role: VendorStaffRole): void {
  if (role !== "owner") {
    throw new AdminInputError("Only the shop owner can manage staff logins.", 403);
  }
}

/** A `function` declaration, so `if (!row) fail(...)` narrows for TypeScript. */
function fail(message: string, status = 400): never {
  throw new AdminInputError(message, status);
}

/* ------------------------------------------------------------------ */
/* Reading the roster                                                  */
/* ------------------------------------------------------------------ */

/**
 * Who can open this shop. Owners see the whole roster; a staff login reading
 * it sees only their own row (the policy's doing), which is exactly the
 * answer they need and nothing they do not.
 */
export async function listVendorStaff(
  db: SupabaseClient,
  shopId: string,
  role: VendorStaffRole,
  viewerUserId: string,
): Promise<VendorStaffMember[]> {
  assertOwner(role);
  const { data, error } = await db
    .from("vendor_users")
    .select("user_id,shop_id,role,created_at,display_name,login_email,added_by")
    .eq("shop_id", shopId)
    .order("role", { ascending: true }) // owners first, then the staff
    .order("created_at", { ascending: true });
  if (error) throw new Error("vendor staff list failed");
  const rows = (data ?? []) as DbVendorUser[];
  return rows.map((row) => mapVendorStaff(row, viewerUserId));
}

const rowOf = async (
  db: SupabaseClient,
  shopId: string,
  userId: string,
): Promise<DbVendorUser | null> => {
  const { data, error } = await db
    .from("vendor_users")
    .select("user_id,shop_id,role,created_at,display_name,login_email,added_by")
    .eq("shop_id", shopId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error("vendor staff read failed");
  return (data as DbVendorUser | null) ?? null;
};

/* ------------------------------------------------------------------ */
/* Opening a login                                                     */
/* ------------------------------------------------------------------ */

/**
 * The auth account behind an e-mail, or null. There is no get-by-email in
 * this client version, so it is the same page scan the admin panel's
 * link-vendor form uses; a lookup failure is answered with null, and the
 * create below then reports the collision itself.
 */
export const findAuthUserIdByEmail = async (
  service: SupabaseClient,
  email: string,
): Promise<string | null> => {
  const wanted = email.trim().toLowerCase();
  if (wanted === "") return null;
  try {
    const { data, error } = await service.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (error) return null;
    return data?.users?.find((u) => (u.email ?? "").toLowerCase() === wanted)?.id ?? null;
  } catch {
    return null;
  }
};

export interface CreateStaffResult {
  staff: VendorStaffMember;
  /**
   * The one-time password. Shown ONCE: there is no e-mail or SMS in this
   * marketplace, so the owner hands it over in person and the person changes
   * it from their own settings.
   */
  password: string;
}

export async function createVendorStaff(opts: {
  service: SupabaseClient;
  db: SupabaseClient;
  shopId: string;
  role: VendorStaffRole;
  ownerUserId: string;
  raw: unknown;
}): Promise<CreateStaffResult> {
  const { service, db, shopId, role, ownerUserId } = opts;
  assertOwner(role);

  const checked = validateStaffInput(opts.raw);
  if (!checked.ok) {
    fail(Object.values(checked.errors)[0] ?? "Check the name and login.", 422);
  }
  const { name, email } = checked.value;

  // The cap and the duplicate are checked BEFORE an account is created: a
  // refused attempt must not leave a login behind.
  const roster = await listVendorStaff(db, shopId, role, ownerUserId);
  const staffCount = roster.filter((m) => m.role === "staff").length;
  if (staffCount >= VENDOR_STAFF_MAX) {
    fail(
      `A shop may have at most ${VENDOR_STAFF_MAX} staff logins — revoke one before adding another.`,
      409,
    );
  }
  if (roster.some((m) => m.loginEmail.toLowerCase() === email.toLowerCase())) {
    fail("That number or e-mail already has access to this shop.", 409);
  }

  const existing = await findAuthUserIdByEmail(service, email);
  if (existing) {
    fail(
      "This number or e-mail already has a PROSANTI login. A shop login has to be its own — use a number they have not signed up with, or ask PROSANTI to link that account.",
      409,
    );
  }

  const password = generateTemporaryPassword();
  const { data: created, error: createError } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: name,
      applied_as: "vendor_staff",
      shop_id: shopId,
    },
  });
  if (createError || !created?.user) {
    const message = createError?.message ?? "";
    if (/already (been )?registered|already exists|email_exists/i.test(message)) {
      fail(
        "This number or e-mail already has a PROSANTI login. A shop login has to be its own — use a number they have not signed up with, or ask PROSANTI to link that account.",
        409,
      );
    }
    throw new Error(`vendor staff account create failed: ${message || "unknown"}`);
  }
  const userId = created.user.id;

  const { data: inserted, error: linkError } = await db
    .from("vendor_users")
    .insert({
      user_id: userId,
      shop_id: shopId,
      role: "staff",
      display_name: name,
      login_email: email,
      added_by: ownerUserId,
    })
    .select("user_id,shop_id,role,created_at,display_name,login_email,added_by")
    .single();

  if (linkError || !inserted) {
    // No half-open login: the account goes back if the shop link did not take.
    await deleteApplicantAccount(service, userId);
    const code = (linkError as { code?: string } | null)?.code ?? "";
    if (code === "23505") {
      fail("That login is already linked to a shop.", 409);
    }
    if (/at most \d+ staff/i.test(linkError?.message ?? "")) {
      fail(linkError?.message ?? "Too many staff logins.", 409);
    }
    throw new Error("vendor staff link failed");
  }

  return { staff: mapVendorStaff(inserted as DbVendorUser, ownerUserId), password };
}

/* ------------------------------------------------------------------ */
/* Revoking and re-opening                                             */
/* ------------------------------------------------------------------ */

export async function revokeVendorStaff(
  db: SupabaseClient,
  shopId: string,
  role: VendorStaffRole,
  userId: string,
): Promise<{ revoked: VendorStaffMember }> {
  assertOwner(role);
  const row = await rowOf(db, shopId, userId);
  if (!row) fail("That login is not on this shop.", 404);
  if (row.role !== "staff") {
    fail("An owner's login cannot be revoked here — ask PROSANTI to do it.", 403);
  }
  const member = mapVendorStaff(row);
  const { data, error } = await db
    .from("vendor_users")
    .delete()
    .eq("shop_id", shopId)
    .eq("user_id", userId)
    .eq("role", "staff")
    .select("user_id");
  if (error) throw new Error("vendor staff revoke failed");
  if ((data ?? []).length === 0) {
    // RLS refused (not their shop, not a staff row) — say so plainly rather
    // than reporting success for something that did not happen.
    fail("That login could not be revoked — it is not a staff login on this shop.", 404);
  }
  return { revoked: member };
}

/** A fresh one-time password for a staff login that was forgotten. */
export async function resetVendorStaffPassword(opts: {
  service: SupabaseClient;
  db: SupabaseClient;
  shopId: string;
  role: VendorStaffRole;
  userId: string;
}): Promise<{ password: string; staff: VendorStaffMember }> {
  const { service, db, shopId, role, userId } = opts;
  assertOwner(role);
  const row = await rowOf(db, shopId, userId);
  if (!row) fail("That login is not on this shop.", 404);
  if (row.role !== "staff") {
    fail("An owner's password is reset from the PROSANTI admin panel.", 403);
  }
  const password = generateTemporaryPassword();
  await setApplicantPassword(service, userId, password);
  return { password, staff: mapVendorStaff(row) };
}
