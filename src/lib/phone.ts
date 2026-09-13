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
