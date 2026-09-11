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
import { toPublicShop } from "../shop-utils";
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

/**
 * Shop application intake. Creates a pending, closed row for the staff
 * queue — never active, never open, no vendor login (slice 3 links the
 * vendor account at approval time via contact_email).
 */
export async function applyShop(
  raw: unknown,
  applicantUserId?: string,
): Promise<{ id: string }> {
  const db = getSupabaseService();
  if (!db) throw new Error("shop intake unavailable");
  // A signed-in applicant links their login to the application immediately —
  // one account owns at most one shop, so an existing link rejects early.
  if (applicantUserId) {
    const { data: existing } = await db
      .from("vendor_users")
      .select("shop_id")
      .eq("user_id", applicantUserId)
      .limit(1);
    if (existing && existing.length > 0) {
      throw new ShopInputError(
        "This account already has a shop — sign in to the vendor dashboard instead.",
        409,
      );
    }
  }
  const b = (raw ?? {}) as Record<string, unknown>;
  const name = clean(b.name, 80);
  const phone = clean(b.phone, 20).replace(/[\s-]/g, "");
  const email = clean(b.email ?? b.contactEmail, 120).toLowerCase();
  const address = clean(b.address, 300);
  const zoneIds = Array.isArray(b.zoneIds)
    ? [...new Set(b.zoneIds.filter((z): z is string => typeof z === "string").map((z) => z.trim()).filter(Boolean))].slice(0, 12)
    : [];

  if (name.length < 2) throw new ShopInputError("Shop name is too short.");
  if (!BD_PHONE_RE.test(phone)) {
    throw new ShopInputError("A valid Bangladeshi mobile number is required.");
  }
  if (!EMAIL_RE.test(email)) {
    throw new ShopInputError("A valid contact email is required.");
  }
  if (zoneIds.length === 0) {
    throw new ShopInputError("Choose at least one delivery zone.");
  }
  const { data: zones } = await db.from("delivery_zones").select("id,active");
  const live = new Set(
    ((zones ?? []) as { id: string; active: boolean }[])
      .filter((z) => z.active)
      .map((z) => z.id),
  );
  if (!zoneIds.every((z) => live.has(z))) {
    throw new ShopInputError("One of the chosen zones is not available.");
  }

  const { data: dupe } = await db
    .from("shops")
    .select("id,status")
    .eq("contact_email", email)
    .neq("status", "suspended")
    .limit(1);
  if (dupe && dupe.length > 0) {
    throw new ShopInputError(
      "This email already has a shop application — we'll be in touch.",
      409,
    );
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
      phone,
      contact_email: email,
      address,
      zone_ids: zoneIds,
      prep_minutes: 15,
      commission_pct: 15,
      status: "pending",
      is_open: false,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error("shop application failed");
  const shopId = (data as { id: string }).id;
  if (applicantUserId) {
    const { error: linkError } = await db.from("vendor_users").insert({
      user_id: applicantUserId,
      shop_id: shopId,
      role: "owner",
    });
    if (linkError && linkError.code !== "23505") {
      throw new Error("shop application link failed");
    }
  }
  return { id: shopId };
}
