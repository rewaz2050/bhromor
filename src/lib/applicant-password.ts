/**
 * Password rules shared by the shop and rider application forms and the
 * server intake (2026-09-26: applying IS signing up — the application
 * carries the email + password that become the dashboard login once staff
 * approves it). Client-safe: no server imports.
 */

import { bnDigits } from "./arrival";

export const APPLICANT_PASSWORD_MIN = 6;
/** bcrypt input ceiling — GoTrue rejects longer secrets. */
export const APPLICANT_PASSWORD_MAX = 72;

/**
 * Bangla problem text for the forms, or null when the pair is acceptable.
 * `confirm` is optional so the server can reuse the same length rule.
 */
export const passwordProblem = (
  password: string,
  confirm?: string,
): string | null => {
  if (password.length < APPLICANT_PASSWORD_MIN) {
    return `পাসওয়ার্ড অন্তত ${bnDigits(String(APPLICANT_PASSWORD_MIN))} অক্ষরের হতে হবে।`;
  }
  if (password.length > APPLICANT_PASSWORD_MAX) {
    return `পাসওয়ার্ড ${bnDigits(String(APPLICANT_PASSWORD_MAX))} অক্ষরের বেশি হতে পারবে না।`;
  }
  if (confirm !== undefined && confirm !== password) {
    return "দুটি পাসওয়ার্ড মিলছে না — একই পাসওয়ার্ড দুইবার লিখুন।";
  }
  return null;
};
