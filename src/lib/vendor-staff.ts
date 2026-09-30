/**
 * C1 (2026-09-28) — the shop's own staff logins.
 *
 * A busy shop is not one person: somebody confirms orders while the owner is
 * at the market. Only PROSANTI staff could open a vendor login before, so the
 * usual workaround was to hand over the OWNER's password — which also opens
 * payouts, the profile and the shop's sign. A staff login is the honest
 * answer, and this module holds the rules that keep it small:
 *
 *   • a staff login is a STAFF login — nothing here can make one an owner;
 *   • the roster is capped (every login is a real account);
 *   • the owner names the person and gives the number or e-mail they will
 *     sign in with — many shop assistants have no e-mail at all, so a mobile
 *     number is a first-class login (synthetic address, nothing is sent).
 *
 * Pure: no clock, no database, no network.
 */

import {
  describeLoginEmail,
  loginHandleFor,
  parseLoginIdentifier,
} from "./phone-login";

/** Mirrors ps_vendor_staff_max() — one number, two places. */
export const VENDOR_STAFF_MAX = 5;

export const STAFF_NAME_MAX = 60;
export const STAFF_LOGIN_MAX = 160;

export type VendorStaffRole = "owner" | "staff";

export interface VendorStaffMember {
  userId: string;
  name: string;
  /** What they type into the login box: the number, or the e-mail. */
  handle: string;
  /** What the account is actually stored under (synthetic for phone logins). */
  loginEmail: string;
  role: VendorStaffRole;
  /** When the login was opened (ms), when the row knows it. */
  addedAt?: number;
  /** True for the row of the person looking at the screen. */
  isYou?: boolean;
}

export interface StaffInput {
  name: string;
  email: string;
  /** The mobile number behind a phone login, or null for a real e-mail. */
  phone: string | null;
}

export interface StaffValidation {
  ok: boolean;
  errors: Partial<Record<"name" | "login", string>>;
  value: StaffInput;
}

const clean = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/**
 * What the owner typed → what may be stored. The name is what the shop's
 * roster shows, so "asdf" is not good enough to hand a login to.
 */
export const validateStaffInput = (raw: unknown): StaffValidation => {
  const b = (raw ?? {}) as Record<string, unknown>;
  const errors: StaffValidation["errors"] = {};

  const name = clean(b.name ?? b.display_name).slice(0, STAFF_NAME_MAX);
  const typed = clean(b.login ?? b.loginEmail ?? b.email).slice(0, STAFF_LOGIN_MAX);

  if (name.length < 2) {
    errors.name = "Type their name — the roster has to say who this is.";
  }

  const parsed = parseLoginIdentifier(typed);
  if (typed === "") {
    errors.login = "Enter the mobile number or e-mail they will sign in with.";
  } else if (parsed.kind === "invalid") {
    errors.login = "Enter a mobile number (01XXXXXXXXX) or an email address.";
  }

  return {
    ok: Object.keys(errors).length === 0,
    errors,
    value: {
      name,
      email: parsed.kind === "invalid" ? "" : parsed.email,
      phone: parsed.kind === "phone" ? parsed.phone : null,
    },
  };
};

/** "01712345678 (phone login)" for a synthetic address, the e-mail otherwise. */
export const staffLoginLabel = (
  loginEmail: string | null | undefined,
  lang: "en" | "bn" = "en",
): string => describeLoginEmail(loginEmail, lang);

/** What the person should type at /vendor/login. */
export const staffHandle = (loginEmail: string | null | undefined): string =>
  loginHandleFor(loginEmail ?? "");

/** "12 Oct" — plain, because it sits next to a name in a list. */
export const staffAddedOn = (addedAt?: number | null): string =>
  typeof addedAt === "number" && Number.isFinite(addedAt) && addedAt > 0
    ? new Date(addedAt).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        timeZone: "UTC",
      })
    : "";

/** How many more logins the shop may open. */
export const staffSlotsLeft = (roster: readonly VendorStaffMember[]): number =>
  Math.max(0, VENDOR_STAFF_MAX - roster.filter((m) => m.role === "staff").length);
