/**
 * Gift Mode (P0 #6) — a gift wrap + note at checkout.
 *
 * Eid and Pohela Boishakh gifting is a real market here and no food app has
 * an equivalent, because food is not a gift. Everything in the flow is about
 * the moment the box is handed over: a recipient name on the label, a card in
 * the box, and — importantly — the price kept off the packing slip so the
 * receiver is not handed a bill.
 *
 * Wrap is paid (৳50 / ৳150), so the fee is part of the order money and is
 * recomputed server-side like every other amount.
 */

import { bdt, type Bdt } from "./format";
import { isPlausibleBdPhone, normalizeBdPhone } from "./phone";

export type WrapId = "none" | "standard" | "premium";

export interface GiftConfig {
  enabled: boolean;
  /** Paid wrapping. 0 hides that option entirely. */
  standardWrapFeePaisa: Bdt;
  premiumWrapFeePaisa: Bdt;
  /** Free text on the card, capped so a hostile payload cannot bloat rows. */
  maxMessageChars: number;
  maxRecipientChars: number;
}

export const GIFT_DEFAULTS: GiftConfig = {
  enabled: true,
  standardWrapFeePaisa: bdt(50),
  premiumWrapFeePaisa: bdt(150),
  maxMessageChars: 240,
  maxRecipientChars: 60,
};

const intIn = (
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.max(min, Math.min(max, Math.floor(value)))
    : fallback;

export const sanitizeGift = (raw: unknown): GiftConfig => {
  const r = (raw ?? {}) as Partial<GiftConfig>;
  return {
    enabled: typeof r.enabled === "boolean" ? r.enabled : GIFT_DEFAULTS.enabled,
    standardWrapFeePaisa: intIn(
      r.standardWrapFeePaisa,
      GIFT_DEFAULTS.standardWrapFeePaisa,
      0,
      bdt(2000),
    ),
    premiumWrapFeePaisa: intIn(
      r.premiumWrapFeePaisa,
      GIFT_DEFAULTS.premiumWrapFeePaisa,
      0,
      bdt(5000),
    ),
    maxMessageChars: intIn(r.maxMessageChars, GIFT_DEFAULTS.maxMessageChars, 20, 500),
    maxRecipientChars: intIn(r.maxRecipientChars, GIFT_DEFAULTS.maxRecipientChars, 8, 120),
  };
};

export interface WrapOption {
  id: WrapId;
  label: string;
  labelBn: string;
  note: string;
  feePaisa: Bdt;
}

export const wrapOptions = (cfg: GiftConfig): WrapOption[] => {
  const list: WrapOption[] = [
    {
      id: "none",
      label: "No wrap",
      labelBn: "র‍্যাপিং লাগবে না",
      note: "Sent in the usual PROSANTI paper bag.",
      feePaisa: 0,
    },
  ];
  if (cfg.standardWrapFeePaisa > 0) {
    list.push({
      id: "standard",
      label: "Gift box + hand-written card",
      labelBn: "গিফট বক্স + হাতে লেখা কার্ড",
      note: "Folded, boxed, tied with jute twine.",
      feePaisa: cfg.standardWrapFeePaisa,
    });
  }
  if (cfg.premiumWrapFeePaisa > cfg.standardWrapFeePaisa) {
    list.push({
      id: "premium",
      label: "Premium hamper box",
      labelBn: "প্রিমিয়াম হ্যাম্পার বক্স",
      note: "Keepsake box, card, and a folded gamcha liner.",
      feePaisa: cfg.premiumWrapFeePaisa,
    });
  }
  return list;
};

export const wrapFeeFor = (wrap: unknown, cfg: GiftConfig): Bdt => {
  if (wrap === "premium") return cfg.premiumWrapFeePaisa;
  if (wrap === "standard") return cfg.standardWrapFeePaisa;
  return 0;
};

export const isWrapId = (value: unknown): value is WrapId =>
  value === "none" || value === "standard" || value === "premium";

export interface GiftDraft {
  isGift: boolean;
  recipientName: string;
  recipientPhone: string;
  message: string;
  wrap: WrapId;
  /**paisa — added to the order total, never a line item (nothing to restock). */
  feePaisa: Bdt;
}

export interface GiftValidation {
  ok: boolean;
  errors: Partial<Record<"recipientName" | "recipientPhone" | "message", string>>;
  value: GiftDraft;
}

const clip = (value: unknown, max: number): string =>
  typeof value === "string"
    ? value
        .replace(/\s+\n/g, "\n")
        .trim()
        .slice(0, max)
    : "";

/**
 * Gift fields are optional in the payload; when `is_gift` is true the recipient
 * becomes required — an anonymous gift cannot be handed to the right person in
 * a town where two families share a name.
 */
export const validateGift = (raw: unknown, cfg: GiftConfig = GIFT_DEFAULTS): GiftValidation => {
  const b = (raw ?? {}) as Record<string, unknown>;
  const isGift = cfg.enabled && b.is_gift === true;
  const wrap = isWrapId(b.gift_wrap) ? (b.gift_wrap as WrapId) : "standard";
  const recipientName = clip(b.gift_recipient_name, cfg.maxRecipientChars);
  const recipientPhoneRaw = clip(b.gift_recipient_phone, 20);
  const message = clip(b.gift_message, cfg.maxMessageChars);
  const errors: GiftValidation["errors"] = {};
  if (isGift) {
    if (recipientName.length < 2) {
      errors.recipientName = "Who is it for? A name goes on the label.";
    }
    if (recipientPhoneRaw !== "" && !isPlausibleBdPhone(recipientPhoneRaw)) {
      errors.recipientPhone = "That mobile number does not look right.";
    }
  }
  return {
    ok: Object.keys(errors).length === 0,
    errors,
    value: {
      isGift,
      recipientName: isGift ? recipientName : "",
      recipientPhone: isGift && recipientPhoneRaw !== "" ? normalizeBdPhone(recipientPhoneRaw) : "",
      message: isGift ? message : "",
      wrap: isGift ? wrap : "none",
      feePaisa: isGift ? wrapFeeFor(wrap, cfg) : 0,
    },
  };
};

/** What the rider reads on the handoff screen. */
export const giftRiderNote = (gift: Pick<GiftDraft, "isGift" | "recipientName">): string =>
  gift.isGift
    ? `GIFT — hand to ${gift.recipientName || "the receiver"} and do not quote the price.`
    : "";

/** The line printed on the card the shop packs into the box. */
export const giftCardText = (gift: GiftDraft): string => {
  if (!gift.isGift) return "";
  const body = gift.message ? `\n“${gift.message}”\n` : "\n";
  return `For ${gift.recipientName}${body}— from the sender`;
};

/** Price-hiding is a feature: the packing slip a receiver sees. */
export const giftSlipNote = (gift: Pick<GiftDraft, "isGift">): string =>
  gift.isGift ? "Gift order — packing slip shows no prices." : "";
