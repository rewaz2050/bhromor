/**
 * Public marketplace reads + shop intake (phase 2, slice 2).
 *
 * Service-role helpers used by the PUBLIC /api/shops routes — the anon key
 * has no shop policies on purpose (contact emails must never leak), so the
 * route re-checks visibility and strips staff-only fields before responding.
 * Staff CRUD lives in ./admin.ts behind requireStaff().
 */

import "server-only";

import { getSupabaseService } from "../supabase-server";
import type { Shop } from "../catalog";
import {
  assertApplicantPassword,
  createApplicantAccount,
  deleteApplicantAccount,
  linksSession,
} from "./applicant-account";
import { toPublicShop } from "../shop-utils";
import { phoneLoginEmail } from "../phone-login";
import { mapShop } from "./mappers";
import type { DbShop } from "./types";

export { toPublicShop };

export class ShopInputError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

const clean = (value: unknown, max: number): string =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BD_PHONE_RE = /^01\d{9}$/;

/**
 * Active shops, optionally scoped to one delivery zone (area-scoped
 * discovery, D3). Null when the backend is unconfigured.
 */
export async function listPublicShops(zoneId?: string): Promise<Shop[] | null> {
  const db = getSupabaseService();
  if (!db) return null;
  const { data, error } = await db
    .from("shops")
    .select("*")
    .eq("status", "active")
    .order("is_open", { ascending: false })
    .order("rating_avg", { ascending: false })
    .order("name");
  if (error) throw new Error("shop list failed");
  const shops = ((data ?? []) as DbShop[]).map(mapShop).map(toPublicShop);
  if (!zoneId) return shops;
  return shops.filter((s) => s.zoneIds.includes(zoneId));
}

/** What an application needs besides the form fields. */
export interface ApplyOptions {
  /**
   * A signed-in applicant (legacy two-step flow). That login is linked when
   * no password was given, or when its email is the application's email;
   * otherwise the form's email + password win, so the credentials on the
   * success screen are always the ones that open the dashboard.
   */
  applicantUserId?: string;
  applicantEmail?: string | null;
  /** Otherwise the application IS the sign-up: this becomes the login. */
  password?: string;
}

export interface ApplyResult {
  id: string;
  userId: string;
  /** False when an existing login with the same email + password was reused. */
  accountCreated: boolean;
  /** The login e-mail the applicant signs in with (synthetic for phone logins). */
  loginEmail: string;
  /**
   * Round 4 — true when a previously `rejected` shop of this same login was
   * rewritten with the new details and put back in the pending queue.
   */
  resubmitted: boolean;
}

/**
 * Shop application intake (2026-09-26: apply = sign up).
 *
 * One form: shop details + email + password. Creates the login (email
 * pre-confirmed), the pending, closed shop row and the owner link in one
 * go — so the moment staff approves, the same email + password opens the
 * vendor dashboard. Never active, never open. A signed-in applicant skips
 * the account step and links the current login instead.
 */
export async function applyShop(
  raw: unknown,
  opts: ApplyOptions = {},
): Promise<ApplyResult> {
  const db = getSupabaseService();
  if (!db) throw new Error("shop intake unavailable");
  const b = (raw ?? {}) as Record<string, unknown>;
  const name = clean(b.name, 80);
  const tagline = clean(b.tagline, 200);
  const phone = clean(b.phone, 20).replace(/[\s-]/g, "");
  const typedEmail = clean(b.email ?? b.contactEmail, 120).toLowerCase();
  const address = clean(b.address, 300);
  const prepRaw = Number(b.prepMinutes ?? b.prep_minutes);
  const prepMinutes = Number.isFinite(prepRaw)
    ? Math.max(5, Math.min(240, Math.floor(prepRaw)))
    : 15;
  const zoneIds = Array.isArray(b.zoneIds)
    ? [...new Set(b.zoneIds.filter((z): z is string => typeof z === "string").map((z) => z.trim()).filter(Boolean))].slice(0, 12)
    : [];

  if (name.length < 2) throw new ShopInputError("Shop name is too short.");
  if (!BD_PHONE_RE.test(phone)) {
    throw new ShopInputError("A valid Bangladeshi mobile number is required.");
  }
  // Round 4 — no e-mail? The mobile number IS the login (synthetic address,
  // nothing is ever sent to it). A typed e-mail must still look like one.
  const email = typedEmail === "" ? phoneLoginEmail(phone) : typedEmail;
  if (!EMAIL_RE.test(email)) {
    throw new ShopInputError("That email does not look right — fix it, or leave it empty to sign in with your mobile number.");
  }
  if (zoneIds.length === 0) {
    throw new ShopInputError("Choose at least one delivery zone.");
  }
  // The password is checked before anything is written so a typo never
  // leaves a half-made application behind.
  const sessionUserId = linksSession(opts, email) ? opts.applicantUserId : undefined;
  const password = sessionUserId ? null : assertApplicantPassword(opts.password);

  const { data: zones } = await db.from("delivery_zones").select("id,active");
  const live = new Set(
    ((zones ?? []) as { id: string; active: boolean }[])
      .filter((z) => z.active)
      .map((z) => z.id),
  );
  if (!zoneIds.every((z) => live.has(z))) {
    throw new ShopInputError("One of the chosen zones is not available.");
  }

  // One shop per email AND per phone — the same shop used to be able to
  // apply twice under two emails. Rejected rows do not block: the same
  // login re-applying rewrites its own row below, and a stranger reusing
  // a rejected shop's phone simply starts fresh.
  const { data: dupe } = await db
    .from("shops")
    .select("id,status,contact_email")
    .or(`contact_email.eq.${email},phone.eq.${phone}`)
    .not("status", "in", "(suspended,rejected)")
    .limit(1);
  if (dupe && dupe.length > 0) {
    const sameEmail = (dupe[0] as { contact_email?: string }).contact_email === email;
    throw new ShopInputError(
      sameEmail
        ? "This email already has a shop application — sign in at /vendor/login once it is approved."
        : "This phone number already belongs to a shop application — sign in at /vendor/login, or use the shop's own number.",
      409,
    );
  }

  // One login owns at most one shop — unless that shop was REJECTED, in
  // which case this application replaces it (round 4).
  const ownedShop = async (
    userId: string,
  ): Promise<{ id: string; status: string } | null> => {
    const { data: existing } = await db
      .from("vendor_users")
      .select("shop_id")
      .eq("user_id", userId)
      .limit(1);
    const shopId = (existing as { shop_id: string }[] | null)?.[0]?.shop_id;
    if (!shopId) return null;
    const { data: shop } = await db
      .from("shops")
      .select("id,status")
      .eq("id", shopId)
      .maybeSingle();
    return (shop as { id: string; status: string } | null) ?? { id: shopId, status: "unknown" };
  };
  const resubmitOrRefuse = async (userId: string, message: string): Promise<string | null> => {
    const owned = await ownedShop(userId);
    if (!owned) return null;
    if (owned.status === "rejected") return owned.id;
    throw new ShopInputError(message, 409);
  };
  let resubmitId: string | null = null;
  if (sessionUserId) {
    resubmitId = await resubmitOrRefuse(
      sessionUserId,
      "This account already has a shop — sign in to the vendor dashboard instead.",
    );
  }

  let userId = sessionUserId ?? "";
  let accountCreated = false;
  if (!userId) {
    const account = await createApplicantAccount(db, {
      email,
      password: password as string,
      name,
      kind: "vendor",
    });
    userId = account.userId;
    accountCreated = account.created;
    if (!accountCreated) {
      resubmitId = await resubmitOrRefuse(
        userId,
        "This login already runs a shop — sign in to the vendor dashboard instead.",
      );
    }
  }
  const undoAccount = async () => {
    if (accountCreated) await deleteApplicantAccount(db, userId);
  };

  if (resubmitId) {
    // Re-application after a rejection: same login, same row, new details,
    // back to the pending queue with the old verdict cleared.
    const { error: redoError } = await db
      .from("shops")
      .update({
        name,
        tagline,
        phone,
        contact_email: email,
        address,
        zone_ids: zoneIds,
        prep_minutes: prepMinutes,
        status: "pending",
        is_open: false,
        review_note: null,
        reviewed_by: null,
        reviewed_by_email: null,
        reviewed_at: null,
      })
      .eq("id", resubmitId)
      .eq("status", "rejected");
    if (redoError) throw new Error("shop re-application failed");
    return { id: resubmitId, userId, accountCreated: false, loginEmail: email, resubmitted: true };
  }

  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50) || "shop";
  let slug = base;
  for (let n = 2; n < 10; n += 1) {
    const { data: clash } = await db.from("shops").select("id").eq("slug", slug).limit(1);
    if (!clash || clash.length === 0) break;
    slug = `${base}-${n}`;
  }
  const { data, error } = await db
    .from("shops")
    .insert({
      slug,
      name,
      tagline,
      phone,
      contact_email: email,
      address,
      zone_ids: zoneIds,
      prep_minutes: prepMinutes,
      commission_pct: 15,
      status: "pending",
      is_open: false,
    })
    .select("id")
    .single();
  if (error || !data) {
    await undoAccount();
    throw new Error("shop application failed");
  }
  const shopId = (data as { id: string }).id;
  const { error: linkError } = await db.from("vendor_users").insert({
    user_id: userId,
    shop_id: shopId,
    role: "owner",
  });
  if (linkError && linkError.code !== "23505") {
    await db.from("shops").delete().eq("id", shopId);
    await undoAccount();
    throw new Error("shop application link failed");
  }
  return { id: shopId, userId, accountCreated, loginEmail: email, resubmitted: false };
}
