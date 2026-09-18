/**
 * Bangladeshi mobile-number helpers — their own module on purpose.
 *
 * These used to live in `engagement.ts`, which also reads ops settings. A
 * settings-level module (gift, price alerts) needing a phone check would then
 * form an import cycle with the settings store, and a cycle evaluated in the
 * wrong order silently hands callers `undefined` defaults. Small, leaf module,
 * no dependencies: the bug cannot come back.
 */

/** 01712345678, +8801712345678 and 8801712345678 all normalize to one form. */
export const normalizeBdPhone = (phone: string): string => {
  const digits = phone.replace(/\D/g, "");
  const local = digits.startsWith("880") ? digits.slice(3) : digits;
  return local.startsWith("0") ? local : `0${local}`;
};

/** Real BD mobile prefixes only — 01[3-9] + 8 digits. */
export const isPlausibleBdPhone = (phone: string): boolean =>
  /^01[3-9]\d{8}$/.test(normalizeBdPhone(phone));

/** Bengali digits (০–৯) → ASCII — phones typed on a Bangla keyboard. */
const BN_DIGITS = "০১২৩৪৫৬৭৮৯";
export const asciiDigits = (value: string): string =>
  value.replace(/[০-৯]/g, (d) => String(BN_DIGITS.indexOf(d)));

/**
 * What the phone INPUT keeps while the customer types (UX audit 2026-09-18,
 * P2 #25). Pasted "+880 17-1234 5678" or a Bangla-keyboard "০১৭…" collapses
 * to the digits a BD mobile actually has; the leading "88"/"+88" is dropped
 * so the field never shows 13 digits when the placeholder promises 11. The
 * value is capped at 11 digits — a 12th keystroke is ignored instead of
 * silently producing an invalid number. Validation stays where it was
 * (`isPlausibleBdPhone`) — this only tidies, it never rejects.
 */
export const tidyPhoneInput = (raw: string): string => {
  let digits = asciiDigits(raw).replace(/\D/g, "");
  if (digits.startsWith("880") && digits.length > 11) digits = digits.slice(2);
  else if (digits.startsWith("88") && digits.length > 11) digits = digits.slice(2);
  return digits.slice(0, 11);
};
