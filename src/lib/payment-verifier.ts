/**
 * Who decides a bKash/Nagad payment (audit N6, migration 202610010002).
 *
 * The wallet numbers customers pay are PROSANTI's own, yet the shop could
 * verify them too. Admin now picks, per shop:
 *   platform → PROSANTI staff only
 *   shop     → the owning shop only
 *   both     → either (the default — the behaviour before the setting)
 */

export const PAYMENT_VERIFIERS = ["platform", "shop", "both"] as const;
export type PaymentVerifier = (typeof PAYMENT_VERIFIERS)[number];

export const DEFAULT_PAYMENT_VERIFIER: PaymentVerifier = "both";

/** Anything unknown (old rows, junk) reads as the safe, backwards-compatible default. */
export const parsePaymentVerifier = (value: unknown): PaymentVerifier =>
  typeof value === "string" &&
  (PAYMENT_VERIFIERS as readonly string[]).includes(value)
    ? (value as PaymentVerifier)
    : DEFAULT_PAYMENT_VERIFIER;

/** Strict parse for admin input: junk is an error, not a silent default. */
export const requirePaymentVerifier = (value: unknown): PaymentVerifier | null =>
  typeof value === "string" &&
  (PAYMENT_VERIFIERS as readonly string[]).includes(value)
    ? (value as PaymentVerifier)
    : null;

export const staffMayVerify = (v: PaymentVerifier | undefined): boolean =>
  (v ?? DEFAULT_PAYMENT_VERIFIER) !== "shop";

export const shopMayVerify = (v: PaymentVerifier | undefined): boolean =>
  (v ?? DEFAULT_PAYMENT_VERIFIER) !== "platform";

export const PAYMENT_VERIFIER_LABEL: Record<PaymentVerifier, string> = {
  platform: "PROSANTI staff verify",
  shop: "The shop verifies",
  both: "Staff or the shop",
};

export const PAYMENT_VERIFIER_HELP: Record<PaymentVerifier, string> = {
  platform:
    "Only PROSANTI staff decide this shop's bKash/Nagad payments. The shop sees the status but has no buttons.",
  shop:
    "Only the shop decides them (staff get no buttons — switch this back to step in). Customers still pay PROSANTI's wallet, so choose this only if the shop can see that money.",
  both: "Either side may decide — whoever gets there first.",
};
