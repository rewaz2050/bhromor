/**
 * Applicant login accounts (2026-09-26).
 *
 * A shop or rider application IS the sign-up: the form carries the email
 * and password that become the dashboard login. The account is created
 * here with the service role, email pre-confirmed — the gate is the
 * admin's approval (the row's status), not an inbox link — so the person
 * can sign in the moment staff confirms them and not before.
 *
 * An email that already has a PROSANTI login (a vendor who created one
 * under the old two-step flow, or a rider who is also opening a shop) is
 * reused when the given password matches it; otherwise the application is
 * refused with the next step instead of silently creating a second
 * identity.
 */

import "server-only";

import { randomInt } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAnon } from "../supabase-server";
import {
  APPLICANT_PASSWORD_MAX,
  APPLICANT_PASSWORD_MIN,
} from "../applicant-password";

export class ApplicantAccountError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export interface ApplicantAccount {
  userId: string;
  /** False when an existing login (same email + password) was reused. */
  created: boolean;
}

export type ApplicantKind = "vendor" | "rider";

const EMAIL_EXISTS_RE = /already (been )?registered|already exists|email_exists/i;

/**
 * Whether a signed-in applicant's session should be linked instead of the
 * form's credentials: yes when no password was given (legacy two-step
 * callers) or when the session's email IS the application email. Otherwise
 * the form's email + password win, so the credentials on the success screen
 * are always the ones that open the dashboard (a staff member testing the
 * form while signed in does not become the shop's owner by accident).
 */
export const linksSession = (
  opts: { applicantUserId?: string; applicantEmail?: string | null; password?: string },
  email: string,
): boolean =>
  !!opts.applicantUserId &&
  (!opts.password || (opts.applicantEmail ?? "").trim().toLowerCase() === email);

/** Length rules the forms also enforce; the server never trusts the form. */
export const assertApplicantPassword = (password: unknown): string => {
  if (typeof password !== "string" || password.length < APPLICANT_PASSWORD_MIN) {
    throw new ApplicantAccountError(
      `Choose a password of at least ${APPLICANT_PASSWORD_MIN} characters — it becomes your login.`,
    );
  }
  if (password.length > APPLICANT_PASSWORD_MAX) {
    throw new ApplicantAccountError(
      `Passwords are limited to ${APPLICANT_PASSWORD_MAX} characters.`,
    );
  }
  return password;
};

/**
 * Create (or, with a matching password, reuse) the login for an applicant.
 * `service` must be the service-role client; `anon` is only used to verify
 * the password of a pre-existing account (defaults to the cookie-less anon
 * client; null when unconfigured, which refuses the reuse path).
 */
export async function createApplicantAccount(
  service: SupabaseClient,
  input: { email: string; password: string; name: string; kind: ApplicantKind },
  anon: SupabaseClient | null = getSupabaseAnon(),
): Promise<ApplicantAccount> {
  const email = input.email.trim().toLowerCase();
  const password = assertApplicantPassword(input.password);

  const { data, error } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: input.name.trim().slice(0, 80),
      applied_as: input.kind,
    },
  });
  if (!error && data?.user) {
    return { userId: data.user.id, created: true };
  }

  const code = (error as { code?: string } | null)?.code ?? "";
  const message = error?.message ?? "";
  if (code === "weak_password" || /weak password|password should/i.test(message)) {
    throw new ApplicantAccountError(
      `That password is too easy to guess — use at least ${APPLICANT_PASSWORD_MIN} characters mixing letters and numbers.`,
    );
  }
  if (code !== "email_exists" && !EMAIL_EXISTS_RE.test(message)) {
    throw new Error(`applicant account create failed: ${message || code || "unknown"}`);
  }

  // The email already has a login. Reuse it only when the applicant proves
  // it is theirs — a throwaway sign-in with the given password.
  if (anon) {
    const { data: signed, error: signError } = await anon.auth.signInWithPassword({
      email,
      password,
    });
    if (!signError && signed?.user) {
      // Nothing is persisted (persistSession: false); revoke the token anyway.
      await anon.auth.signOut().catch(() => undefined);
      return { userId: signed.user.id, created: false };
    }
  }
  throw new ApplicantAccountError(
    "This email already has a PROSANTI login. Enter that account's password here, or sign in first and then apply.",
    409,
  );
}

/** Best-effort compensation when the application row fails after sign-up. */
export async function deleteApplicantAccount(
  service: SupabaseClient,
  userId: string,
): Promise<void> {
  try {
    await service.auth.admin.deleteUser(userId);
  } catch {
    // The row insert already failed; a stray login is the lesser problem and
    // the retry path reuses it via the matching-password branch above.
  }
}

/* ------------------------------------------------------------------ */
/* Staff password reset (no e-mail, no SMS)                            */
/* ------------------------------------------------------------------ */

/**
 * Readable one-time password for staff to pass on by phone: three groups
 * of three from an alphabet without look-alikes (no 0/O, 1/l/I). ~47 bits.
 */
const TEMP_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
export const generateTemporaryPassword = (): string => {
  const group = () =>
    Array.from({ length: 3 }, () => TEMP_ALPHABET[randomInt(TEMP_ALPHABET.length)]).join("");
  return `${group()}-${group()}-${group()}`;
};

/**
 * Overwrite an applicant's password with the service role. There is no
 * e-mail step in this onboarding, so a forgotten password is fixed by staff
 * from Admin → Shops / Riders; the temporary value is shown once and the
 * person changes it from their own settings afterwards.
 */
export async function setApplicantPassword(
  service: SupabaseClient,
  userId: string,
  password: string,
): Promise<void> {
  const { error } = await service.auth.admin.updateUserById(userId, {
    password: assertApplicantPassword(password),
  });
  if (error) throw new Error(`password reset failed: ${error.message}`);
}
