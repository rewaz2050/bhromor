/**
 * Messages staff send to shop and rider applicants (apply = sign up,
 * 2026-09-26). No SMS/e-mail provider is involved: these are wa.me deep
 * links the admin taps from the queue, prefilled in Bangla, and the login
 * URLs the applicant needs. Client-safe.
 */

import { absoluteUrl } from "./site-url";
import { waLink } from "./whatsapp-order";

export type ApplicantKind = "vendor" | "rider";

export const applicantLoginUrl = (kind: ApplicantKind): string =>
  absoluteUrl(kind === "vendor" ? "/vendor/login" : "/rider/login");

/** "Approved — sign in with the email + password from your application." */
export const approvalMessage = (input: {
  kind: ApplicantKind;
  name: string;
  email?: string | null;
}): string => {
  const login = applicantLoginUrl(input.kind);
  const who = input.name.trim() || (input.kind === "vendor" ? "আপনার দোকান" : "আপনি");
  const email = input.email?.trim();
  return input.kind === "vendor"
    ? [
        `PROSANTI: ${who} — আপনার দোকান অনুমোদিত হয়েছে! 🎉`,
        `আবেদনের সময় দেওয়া ইমেইল${email ? ` (${email})` : ""} ও পাসওয়ার্ড দিয়ে এখানে সাইন ইন করুন: ${login}`,
        "প্রথমে দোকানের সময় ঠিক করে প্রোডাক্ট যোগ করুন — অর্ডার আসা শুরু হবে।",
      ].join("\n")
    : [
        `PROSANTI: ${who}, আপনার রাইডার আবেদন অনুমোদিত হয়েছে! 🎉`,
        `আবেদনের সময় দেওয়া ইমেইল${email ? ` (${email})` : ""} ও পাসওয়ার্ড দিয়ে এখানে সাইন ইন করুন: ${login}`,
        "অ্যাপে ঢুকে “অনলাইন” করলেই ট্রিপের অনুরোধ পাবেন।",
      ].join("\n");
};

/**
 * Password reset hand-off. The temporary password is NOT put in the link:
 * the admin reads it out by phone or pastes it after the chat opens.
 */
export const passwordResetMessage = (input: {
  kind: ApplicantKind;
  name: string;
}): string => {
  const login = applicantLoginUrl(input.kind);
  const who = input.name.trim() || "আপনি";
  return [
    `PROSANTI: ${who}, আপনার ${input.kind === "vendor" ? "ভেন্ডর" : "রাইডার"} লগইনের পাসওয়ার্ড রিসেট করা হয়েছে।`,
    "অস্থায়ী পাসওয়ার্ডটি এই চ্যাটে/ফোনে জানানো হচ্ছে —",
    `সাইন ইন: ${login}`,
    "ঢোকার পর সেটিংস থেকে নিজের পাসওয়ার্ড বদলে নিন।",
  ].join("\n");
};

/** wa.me link for the approval message — null when the phone is not a BD mobile. */
export const approvalWhatsAppLink = (input: {
  kind: ApplicantKind;
  name: string;
  phone: string | null | undefined;
  email?: string | null;
}): string | null => waLink(input.phone, approvalMessage(input));

export const passwordResetWhatsAppLink = (input: {
  kind: ApplicantKind;
  name: string;
  phone: string | null | undefined;
}): string | null => waLink(input.phone, passwordResetMessage(input));
