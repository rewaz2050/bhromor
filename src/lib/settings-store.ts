/**
 * Operational settings (§58) — configurable low-stock threshold + delivery
 * surcharges + loyalty + the P0 growth levers (flash drop, bundle sets,
 * gift mode, referral, size finder, price alerts).
 *
 * One document, one save button, one source of truth: the storefront reads the
 * same sanitized object the checkout prices with (see order-validation.ts), so
 * a badge and the money can never disagree.
 */

import {
  FLASH_DEFAULTS,
  sanitizeBundle,
  sanitizeFlash,
  type BundleConfig,
  type FlashConfig,
} from "./promos";
import { DEFAULT_SURCHARGE_RATES, type SurchargeRates } from "./delivery";
import { GIFT_DEFAULTS, sanitizeGift, type GiftConfig } from "./gift";
import { REFERRAL_DEFAULTS, sanitizeReferral, type ReferralConfig } from "./referral";
import {
  CAMPAIGN_DEFAULTS,
  sanitizeCampaign,
  type CampaignConfig,
} from "./campaign";
import { PLUS_DEFAULTS, sanitizePlus, type PlusConfig } from "./membership";

export interface AdminSettings {
  lowStockThreshold: number;
  // Loyalty Stamp Card settings (§10-Order Reward Engine)
  loyaltyEnabled: boolean;
  loyaltyTargetOrders: number;
  loyaltyRewardTitle: string;
  loyaltyRewardDescription: string;
  loyaltyMinOrderAmount: number; // in Taka
  // Delivery surcharges — Sunamganj real
  rainSurchargeEnabled: boolean;
  nightSurchargeEnabled: boolean;
  expressDeliveryEnabled: boolean;
  perZoneFreeThresholdEnabled: boolean;
  /** The amounts behind the toggles, in paisa (admin-editable, 2026-09-21). */
  surcharges: SurchargeRates;
  /** Courier (outside Sadar) minimum order, in paisa. */
  courierMinOrderPaisa: number;
  // P1 #8 — wallet payment numbers (the shop's OWN bKash/Nagad number;
  // empty string = the method is not offered at checkout).
  wallets: { bkash: string; nagad: string };
  // Contact channels shown on the Contact page + the track-page WhatsApp
  // button. Empty = the channel is hidden, never a placeholder number.
  contact: { phone: string; whatsapp: string; email: string };
  // P0 growth levers (the "better than foodpanda" list)
  sizeFinderEnabled: boolean;
  priceAlertsEnabled: boolean;
  flash: FlashConfig;
  bundle: BundleConfig;
  gift: GiftConfig;
  referral: ReferralConfig;
  /** P2 #20 — the seasonal campaign landing (/campaign). Armed off by default. */
  campaign: CampaignConfig;
  /** P2 #17 — PROSANTI+ membership program. */
  plus: PlusConfig;
}

export const SETTINGS_DEFAULTS: AdminSettings = {
  lowStockThreshold: 5,
  loyaltyEnabled: true,
  loyaltyTargetOrders: 10,
  loyaltyRewardTitle: "এক্সক্লুসিভ গিফট হ্যাম্পার",
  loyaltyRewardDescription:
    "১০টি সফল ডেলিভারি সম্পন্ন করার জন্য অভিনন্দন! পরবর্তী অর্ডারের সাথে আপনার বিশেষ উপহার পৌঁছে দেওয়া হবে।",
  loyaltyMinOrderAmount: 0,
  rainSurchargeEnabled: false,
  nightSurchargeEnabled: true,
  expressDeliveryEnabled: true,
  perZoneFreeThresholdEnabled: true,
  surcharges: { ...DEFAULT_SURCHARGE_RATES },
  courierMinOrderPaisa: 50_000,
  // No wallet configured → checkout offers COD only, until the shop adds
  // its bKash/Nagad number in Admin → Settings.
  wallets: { bkash: "", nagad: "" },
  // No contact channel configured → the channel is hidden, not faked.
  contact: { phone: "", whatsapp: "", email: "" },
  sizeFinderEnabled: true,
  priceAlertsEnabled: true,
  // A flash drop moves real margin, so it ships DISARMED: the owner arms it in
  // Admin → Growth ("arm tonight's drop" is one button). The countdown rail
  // simply does not render until then.
  flash: FLASH_DEFAULTS,
  // Bundles are the differentiator the brief asks for — on from day one.
  bundle: { enabled: true, name: "Eid Set", discountPct: 10, maxItems: 4, minComplements: 1 },
  gift: GIFT_DEFAULTS,
  referral: REFERRAL_DEFAULTS,
  // No dates, no copy, off — the /campaign page honestly says "nothing
  // running" until the owner arms a real window in Admin → Growth.
  campaign: CAMPAIGN_DEFAULTS,
  plus: PLUS_DEFAULTS,
};

/** Paisa rate: any finite number 0..cap, else the default. */
const moneyCap = (value: unknown, fallback: number, cap: number): number =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.min(cap, Math.floor(value)))
    : fallback;

const intRates = (raw: unknown): SurchargeRates => {
  const r = (raw ?? {}) as Partial<SurchargeRates>;
  return {
    night: moneyCap(r.night, DEFAULT_SURCHARGE_RATES.night, 50_000),
    rain: moneyCap(r.rain, DEFAULT_SURCHARGE_RATES.rain, 50_000),
    express: moneyCap(r.express, DEFAULT_SURCHARGE_RATES.express, 50_000),
    weightPerKg: moneyCap(r.weightPerKg, DEFAULT_SURCHARGE_RATES.weightPerKg, 50_000),
  };
};

export const sanitizeSettings = (raw: unknown): AdminSettings => {
  const p = (raw ?? {}) as Partial<AdminSettings>;
  const threshold =
    typeof p.lowStockThreshold === "number" &&
    Number.isFinite(p.lowStockThreshold)
      ? Math.max(0, Math.floor(p.lowStockThreshold))
      : SETTINGS_DEFAULTS.lowStockThreshold;

  const loyaltyEnabled =
    typeof p.loyaltyEnabled === "boolean"
      ? p.loyaltyEnabled
      : SETTINGS_DEFAULTS.loyaltyEnabled;

  const loyaltyTargetOrders =
    typeof p.loyaltyTargetOrders === "number" &&
    Number.isFinite(p.loyaltyTargetOrders)
      ? Math.max(1, Math.min(50, Math.floor(p.loyaltyTargetOrders)))
      : SETTINGS_DEFAULTS.loyaltyTargetOrders;

  const loyaltyRewardTitle =
    typeof p.loyaltyRewardTitle === "string" &&
    p.loyaltyRewardTitle.trim().length > 0
      ? p.loyaltyRewardTitle.trim().slice(0, 120)
      : SETTINGS_DEFAULTS.loyaltyRewardTitle;

  const loyaltyRewardDescription =
    typeof p.loyaltyRewardDescription === "string" &&
    p.loyaltyRewardDescription.trim().length > 0
      ? p.loyaltyRewardDescription.trim().slice(0, 500)
      : SETTINGS_DEFAULTS.loyaltyRewardDescription;

  const loyaltyMinOrderAmount =
    typeof p.loyaltyMinOrderAmount === "number" &&
    Number.isFinite(p.loyaltyMinOrderAmount)
      ? Math.max(0, Math.floor(p.loyaltyMinOrderAmount))
      : SETTINGS_DEFAULTS.loyaltyMinOrderAmount;

  const rainSurchargeEnabled =
    typeof p.rainSurchargeEnabled === "boolean"
      ? p.rainSurchargeEnabled
      : SETTINGS_DEFAULTS.rainSurchargeEnabled;
  const nightSurchargeEnabled =
    typeof p.nightSurchargeEnabled === "boolean"
      ? p.nightSurchargeEnabled
      : SETTINGS_DEFAULTS.nightSurchargeEnabled;
  const expressDeliveryEnabled =
    typeof p.expressDeliveryEnabled === "boolean"
      ? p.expressDeliveryEnabled
      : SETTINGS_DEFAULTS.expressDeliveryEnabled;
  const perZoneFreeThresholdEnabled =
    typeof p.perZoneFreeThresholdEnabled === "boolean"
      ? p.perZoneFreeThresholdEnabled
      : SETTINGS_DEFAULTS.perZoneFreeThresholdEnabled;

  const bool = (value: unknown, fallback: boolean): boolean =>
    typeof value === "boolean" ? value : fallback;

  // P1 #8 — wallet numbers: BD mobile only (01XXXXXXXXX, +880 accepted);
  // anything else is dropped so the checkout can never print an unsendable
  // number.
  const walletNum = (v: unknown): string => {
    let digits = typeof v === "string" ? v.replace(/\D/g, "") : "";
    if (digits.length > 11 && digits.startsWith("88")) digits = digits.slice(2);
    return /^01\d{9}$/.test(digits) ? digits : "";
  };

  // Contact channels: the same BD-mobile rule for the numbers; the email is
  // trimmed/lowercased and kept only if it is a real-looking address.
  const contactRaw = (p.contact as { phone?: unknown; whatsapp?: unknown; email?: unknown } | undefined) ?? {};
  const emailRaw =
    typeof contactRaw.email === "string"
      ? contactRaw.email.trim().toLowerCase().slice(0, 254)
      : "";
  const plausibleEmail =
    emailRaw.length >= 5 &&
    emailRaw.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw);

  return {
    lowStockThreshold: threshold,
    loyaltyEnabled,
    loyaltyTargetOrders,
    loyaltyRewardTitle,
    loyaltyRewardDescription,
    loyaltyMinOrderAmount,
    rainSurchargeEnabled,
    nightSurchargeEnabled,
    expressDeliveryEnabled,
    perZoneFreeThresholdEnabled,
    sizeFinderEnabled: bool(p.sizeFinderEnabled, SETTINGS_DEFAULTS.sizeFinderEnabled),
    priceAlertsEnabled: bool(p.priceAlertsEnabled, SETTINGS_DEFAULTS.priceAlertsEnabled),
    wallets: {
      bkash: walletNum((p.wallets as { bkash?: unknown } | undefined)?.bkash),
      nagad: walletNum((p.wallets as { nagad?: unknown } | undefined)?.nagad),
    },
    contact: {
      phone: walletNum(contactRaw.phone),
      whatsapp: walletNum(contactRaw.whatsapp),
      email: plausibleEmail ? emailRaw : "",
    },
    surcharges: intRates(p.surcharges),
    courierMinOrderPaisa: moneyCap(p.courierMinOrderPaisa, SETTINGS_DEFAULTS.courierMinOrderPaisa, 500_000),
    // Each growth lever sanitizes itself — a stored doc is never trusted raw.
    flash: sanitizeFlash(p.flash),
    bundle: sanitizeBundle(p.bundle),
    gift: sanitizeGift(p.gift),
    referral: sanitizeReferral(p.referral),
    campaign: sanitizeCampaign(p.campaign),
    plus: sanitizePlus(p.plus),
  };
};
