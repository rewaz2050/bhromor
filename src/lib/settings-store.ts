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
import { GIFT_DEFAULTS, sanitizeGift, type GiftConfig } from "./gift";
import { REFERRAL_DEFAULTS, sanitizeReferral, type ReferralConfig } from "./referral";

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
  // P1 #8 — wallet payment numbers (the shop's OWN bKash/Nagad number;
  // empty string = the method is not offered at checkout).
  wallets: { bkash: string; nagad: string };
  // P0 growth levers (the "better than foodpanda" list)
  sizeFinderEnabled: boolean;
  priceAlertsEnabled: boolean;
  flash: FlashConfig;
  bundle: BundleConfig;
  gift: GiftConfig;
  referral: ReferralConfig;
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
  // No wallet configured → checkout offers COD only, until the shop adds
  // its bKash/Nagad number in Admin → Settings.
  wallets: { bkash: "", nagad: "" },
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
    // Each growth lever sanitizes itself — a stored doc is never trusted raw.
    flash: sanitizeFlash(p.flash),
    bundle: sanitizeBundle(p.bundle),
    gift: sanitizeGift(p.gift),
    referral: sanitizeReferral(p.referral),
  };
};
