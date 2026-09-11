/**
 * Operational settings (§58) — configurable low-stock threshold + delivery
 * surcharges + loyalty. Shared types and defaults; staff edits persist to
 * site_settings via /api/admin/settings (see use-settings.ts).
 */

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
  };
};
