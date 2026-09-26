/**
 * Messages staff send to shop and rider applicants (apply = sign up,
 * 2026-09-26). No SMS/e-mail provider is involved: these are wa.me deep
 * links the admin taps from the queue, prefilled in Bangla, and the login
 * URLs the applicant needs. Client-safe.
 */

import { absoluteUrl } from "./site-url";
import { waLink } from "./whatsapp-order";
import { phoneFromLoginEmail } from "./phone-login";

export type ApplicantKind = "vendor" | "rider";

export const applicantLoginUrl = (kind: ApplicantKind): string =>
  absoluteUrl(kind === "vendor" ? "/vendor/login" : "/rider/login");

export const applicantApplyUrl = (kind: ApplicantKind): string =>
  absoluteUrl(kind === "vendor" ? "/shops/apply" : "/rider/apply");

/**
 * "sign in with the e-mail (x) and password" — or, for a phone login
 * (round 4, synthetic address), "with the mobile number (01…) and password".
 */
const credentialsPhrase = (email?: string | null): string => {
  const trimmed = email?.trim();
  const phone = phoneFromLoginEmail(trimmed);
  if (phone) return `আবেদনের সময় দেওয়া মোবাইল নম্বর (${phone}) ও পাসওয়ার্ড`;
  return `আবেদনের সময় দেওয়া ইমেইল${trimmed ? ` (${trimmed})` : ""} ও পাসওয়ার্ড`;
};

/** "Approved — sign in with the email + password from your application." */
export const approvalMessage = (input: {
  kind: ApplicantKind;
  name: string;
  email?: string | null;
}): string => {
  const login = applicantLoginUrl(input.kind);
  const who = input.name.trim() || (input.kind === "vendor" ? "আপনার দোকান" : "আপনি");
  const creds = credentialsPhrase(input.email);
  return input.kind === "vendor"
    ? [
        `PROSANTI: ${who} — আপনার দোকান অনুমোদিত হয়েছে! 🎉`,
        `${creds} দিয়ে এখানে সাইন ইন করুন: ${login}`,
        "প্রথমে দোকানের সময় ঠিক করে প্রোডাক্ট যোগ করুন — অর্ডার আসা শুরু হবে।",
      ].join("\n")
    : [
        `PROSANTI: ${who}, আপনার রাইডার আবেদন অনুমোদিত হয়েছে! 🎉`,
        `${creds} দিয়ে এখানে সাইন ইন করুন: ${login}`,
        "অ্যাপে ঢুকে “অনলাইন” করলেই ট্রিপের অনুরোধ পাবেন।",
      ].join("\n");
};

/**
 * Round 4 — application REJECTED with a reason. The same login stays
 * valid: the applicant fixes the details and applies again, which puts the
 * same row back in the queue.
 */
export const applicationRejectedMessage = (input: {
  kind: ApplicantKind;
  name: string;
  note?: string | null;
}): string => {
  const who = input.name.trim() || "আপনি";
  const note = input.note?.trim();
  const noun = input.kind === "vendor" ? "দোকানের আবেদন" : "রাইডার আবেদন";
  return [
    `PROSANTI: ${who}, আপনার ${noun}টি এবার অনুমোদন করা যায়নি।`,
    note ? `কারণ: ${note}` : "বিস্তারিত জানতে এই নম্বরে উত্তর দিন।",
    `তথ্য ঠিক করে একই লগইনে আবার আবেদন করুন: ${applicantApplyUrl(input.kind)}`,
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

/**
 * Reset REQUEST approved: the person sets the new password themselves from
 * the login page within 24 h. Nothing secret to carry — just where to go.
 */
export const resetApprovedMessage = (input: {
  kind: ApplicantKind;
  name: string;
}): string => {
  const login = applicantLoginUrl(input.kind);
  const who = input.name.trim() || "আপনি";
  return [
    `PROSANTI: ${who}, আপনার পাসওয়ার্ড রিসেটের অনুরোধ অনুমোদিত হয়েছে।`,
    `এখানে যান: ${login}`,
    "“পাসওয়ার্ড ভুলে গেছেন?” চাপুন → আবেদনের ইমেইল ও ফোন দিন → নতুন পাসওয়ার্ড লিখুন।",
    "২৪ ঘণ্টার মধ্যে করে নিন; পরে আবার অনুরোধ করতে হবে।",
  ].join("\n");
};

/** Reset request rejected — tell them why and what to do. */
export const resetRejectedMessage = (input: {
  kind: ApplicantKind;
  name: string;
  note?: string | null;
}): string => {
  const who = input.name.trim() || "আপনি";
  const note = input.note?.trim();
  return [
    `PROSANTI: ${who}, আপনার পাসওয়ার্ড রিসেটের অনুরোধটি অনুমোদন করা যায়নি।`,
    note ? `কারণ: ${note}` : "আবেদনের সময়ের ইমেইল ও ফোন নম্বর মিলিয়ে আবার অনুরোধ করুন।",
    "সমস্যা হলে এই নম্বরে উত্তর দিন।",
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

export const applicationRejectedWhatsAppLink = (input: {
  kind: ApplicantKind;
  name: string;
  phone: string | null | undefined;
  note?: string | null;
}): string | null => waLink(input.phone, applicationRejectedMessage(input));

export const resetApprovedWhatsAppLink = (input: {
  kind: ApplicantKind;
  name: string;
  phone: string | null | undefined;
}): string | null => waLink(input.phone, resetApprovedMessage(input));

export const resetRejectedWhatsAppLink = (input: {
  kind: ApplicantKind;
  name: string;
  phone: string | null | undefined;
  note?: string | null;
}): string | null => waLink(input.phone, resetRejectedMessage(input));
