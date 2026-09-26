/**
 * Phone-number login without SMS (round 4, 2026-09-26).
 *
 * Many riders (and some shop owners) have no e-mail address. Supabase Auth
 * still wants one for password sign-in, so an applicant who leaves the
 * e-mail field empty gets a SYNTHETIC login e-mail derived from their
 * mobile number: `01712345678@phone.prosanti.app`. Nothing is ever sent to
 * that address — onboarding has no e-mail or SMS step by design — it is
 * only the key Supabase stores the password under.
 *
 * Every login form accepts "e-mail or mobile number" and calls
 * `loginIdentifierToEmail` before `signInWithPassword`, so the rider types
 * the number they know. Staff screens show the number plus a "phone login"
 * tag instead of the synthetic address (`describeLoginEmail`).
 *
 * Leaf module: only depends on `./phone` (itself dependency-free) so it can
 * be imported from server routes, client forms and tests alike.
 */

import { asciiDigits, isPlausibleBdPhone, normalizeBdPhone } from "./phone";

/** Reserved, never-delivered domain for synthetic phone logins. */
export const PHONE_LOGIN_DOMAIN = "phone.prosanti.app";

const SYNTHETIC_RE = new RegExp(
  `^(01[3-9]\\d{8})@${PHONE_LOGIN_DOMAIN.replace(/\./g, "\\.")}$`,
  "i",
);

/** `01712345678` (any BD spelling) → `01712345678@phone.prosanti.app`. */
export const phoneLoginEmail = (phone: string): string =>
  `${normalizeBdPhone(asciiDigits(phone))}@${PHONE_LOGIN_DOMAIN}`;

/** True for addresses minted by `phoneLoginEmail`. */
export const isPhoneLoginEmail = (email: string | null | undefined): boolean =>
  typeof email === "string" && SYNTHETIC_RE.test(email.trim());

/** The mobile number behind a synthetic address, or null for a real e-mail. */
export const phoneFromLoginEmail = (email: string | null | undefined): string | null => {
  if (typeof email !== "string") return null;
  const m = SYNTHETIC_RE.exec(email.trim());
  return m ? m[1] : null;
};

/** Loose e-mail shape — the same test the apply forms have always used. */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * What a login form typed: a real e-mail, a BD mobile number (ASCII or
 * Bangla digits, with or without +88 / spaces / dashes), or garbage.
 */
export type LoginIdentifier =
  | { kind: "email"; email: string }
  | { kind: "phone"; email: string; phone: string }
  | { kind: "invalid" };

export const parseLoginIdentifier = (raw: string): LoginIdentifier => {
  const value = raw.trim();
  if (value === "") return { kind: "invalid" };
  if (value.includes("@")) {
    const email = value.toLowerCase();
    return EMAIL_SHAPE.test(email) ? { kind: "email", email } : { kind: "invalid" };
  }
  const digits = asciiDigits(value).replace(/[\s\-().]/g, "");
  if (!/^\+?\d+$/.test(digits)) return { kind: "invalid" };
  if (!isPlausibleBdPhone(digits)) return { kind: "invalid" };
  const phone = normalizeBdPhone(digits);
  return { kind: "phone", phone, email: phoneLoginEmail(phone) };
};

/**
 * The e-mail to hand to Supabase for whatever the user typed, or null when
 * it is neither an e-mail nor a plausible BD mobile number.
 */
export const loginIdentifierToEmail = (raw: string): string | null => {
  const parsed = parseLoginIdentifier(raw);
  return parsed.kind === "invalid" ? null : parsed.email;
};

/**
 * Staff-facing label: a real e-mail is shown as-is; a synthetic one becomes
 * the number plus a tag, in the requested language.
 */
export const describeLoginEmail = (
  email: string | null | undefined,
  lang: "en" | "bn" = "en",
): string => {
  if (!email) return lang === "bn" ? "ইমেইল নেই" : "no email";
  const phone = phoneFromLoginEmail(email);
  if (!phone) return email;
  return lang === "bn" ? `${phone} (ফোন লগইন)` : `${phone} (phone login)`;
};

/**
 * What the applicant should type in the login box later: the real e-mail,
 * or — for a phone login — the mobile number itself.
 */
export const loginHandleFor = (email: string): string =>
  phoneFromLoginEmail(email) ?? email;
