/**
 * Public rider intake (phase 3, slice 6).
 *
 * Service-role helper used by the PUBLIC /api/riders/apply route — the anon
 * key has no rider policies on purpose (phones + emails must never leak), so
 * the route only ever confirms receipt. Staff CRUD lives in ./admin.ts
 * behind requireStaff().
 *
 * Auth note: Supabase password login needs an email identifier (phone +
 * password is not a Supabase flow without an SMS provider), so every
 * application collects a contact email that becomes the rider login, exactly
 * like vendors. The rider app signs in with the same email + password the
 * applicant registers with.
 */

import "server-only";

import { getSupabaseService } from "../supabase-server";

export class RiderInputError extends Error {
  readonly status: number;

  constructor(message: string, status = 422) {
    super(message);
    this.name = "RiderInputError";
    this.status = status;
  }
}

const clean = (value: unknown, max: number): string =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BD_PHONE_RE = /^01\d{9}$/;
const VEHICLES = new Set(["bicycle", "bike", "scooter"]);

/** A rider application → a `pending` row. One account owns one rider. */
export async function applyRider(
  raw: unknown,
  applicantUserId?: string,
): Promise<{ id: string }> {
  const db = getSupabaseService();
  if (!db) throw new Error("rider intake unavailable");
  if (applicantUserId) {
    const { data: existing } = await db
      .from("riders")
      .select("id")
      .eq("user_id", applicantUserId)
      .limit(1);
    if (existing && existing.length > 0) {
      throw new RiderInputError(
        "This account is already a rider — sign in to the rider app instead.",
        409,
      );
    }
  }
  const b = (raw ?? {}) as Record<string, unknown>;
  const name = clean(b.name, 80);
  const phone = clean(b.phone, 20).replace(/[\s-]/g, "");
  const email = clean(b.email ?? b.contactEmail, 120).toLowerCase();
  const vehicle = clean(b.vehicle, 12).toLowerCase();
  const zoneIds = Array.isArray(b.zoneIds)
    ? [
        ...new Set(
          b.zoneIds
            .filter((z): z is string => typeof z === "string")
            .map((z) => z.trim())
            .filter(Boolean),
        ),
      ].slice(0, 12)
    : [];

  if (name.length < 2) throw new RiderInputError("Rider name is too short.");
  if (!BD_PHONE_RE.test(phone)) {
    throw new RiderInputError("A valid Bangladeshi mobile number is required.");
  }
  if (!EMAIL_RE.test(email)) {
    throw new RiderInputError(
      "A valid email is required — it becomes your rider login.",
    );
  }
  if (!VEHICLES.has(vehicle)) {
    throw new RiderInputError("Choose a vehicle: bicycle, bike or scooter.");
  }
  if (zoneIds.length === 0) {
    throw new RiderInputError("Choose at least one delivery zone.");
  }
  const { data: zones } = await db.from("delivery_zones").select("id,active");
  const live = new Set(
    ((zones ?? []) as { id: string; active: boolean }[])
      .filter((z) => z.active)
      .map((z) => z.id),
  );
  if (!zoneIds.every((z) => live.has(z))) {
    throw new RiderInputError("One of the chosen zones is not available.");
  }

  const { data: dupe } = await db
    .from("riders")
    .select("id")
    .or(`phone.eq.${phone},contact_email.eq.${email}`)
    .neq("status", "suspended")
    .limit(1);
  if (dupe && dupe.length > 0) {
    throw new RiderInputError(
      "This phone or email already has a rider application — we'll be in touch.",
      409,
    );
  }

  const { data, error } = await db
    .from("riders")
    .insert({
      user_id: applicantUserId ?? null,
      name,
      phone,
      contact_email: email,
      vehicle,
      zone_ids: zoneIds,
      status: "pending",
      is_online: false,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error("rider application failed");
  return { id: (data as { id: string }).id };
}
