/**
 * The shop's contact channels — the shape and the rules, shared by the page
 * (which reads them on the server) and /api/contact (which the page used to
 * wait for).
 *
 * Every field is either a number the shop actually saved or null: a visitor
 * never sees a placeholder phone or a made-up inbox.
 */

export interface ContactInfo {
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
}

export const NO_CONTACT: ContactInfo = { phone: null, whatsapp: null, email: null };

const BD_MOBILE = /^01\d{9}$/;

/** Digits only, country code stripped — what a `tel:`/`wa.me` link needs. */
const mobile = (v: unknown): string | null => {
  let digits = typeof v === "string" ? v.replace(/\D/g, "") : "";
  if (digits.length > 11 && digits.startsWith("88")) digits = digits.slice(2);
  return BD_MOBILE.test(digits) ? digits : null;
};

/**
 * Ops settings document → the three channels. Anything unconfigured or
 * malformed comes back null rather than guessed at.
 */
export const shapeContact = (ops: unknown): ContactInfo => {
  const root = (ops ?? {}) as Record<string, unknown>;
  const contact = (root.contact ?? {}) as Record<string, unknown>;
  const emailRaw = typeof contact.email === "string" ? contact.email.trim().toLowerCase() : "";
  return {
    phone: mobile(contact.phone),
    whatsapp: mobile(contact.whatsapp) ?? mobile(contact.phone),
    email:
      emailRaw.length >= 5 &&
      emailRaw.length <= 254 &&
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw)
        ? emailRaw
        : null,
  };
};
