/**
 * Operational settings (§58) — configurable low-stock threshold + delivery surcharges
 * + loyalty. Browser-local demo store; Supabase phase moves to site_settings.
 */

export const SETTINGS_STORAGE_KEY = "prosanti.admin.settings.v1";

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
    "১০টি সফল ডেলিভারি সম্পন্ন করার জন্য অভিনন্দন! পরবর্তী অর্ডারের সাথে আপনার বিশেষ উপহার পৌঁছে দেওয়া হবে।",
  loyaltyMinOrderAmount: 0,
  rainSurchargeEnabled: false,
  nightSurchargeEnabled: true,
  expressDeliveryEnabled: true,
  perZoneFreeThresholdEnabled: true,
};

/* ------------------------------------------------------------------ */

type Listener = () => void;

let cache: AdminSettings | null = null;
let loaded = false;
const listeners = new Set<Listener>();

const notify = () => {
  for (const l of listeners) l();
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

const ensureLoaded = (): AdminSettings => {
  if (cache && loaded) return cache;
  loaded = true;
  if (typeof window !== "undefined") {
    try {
      const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (raw) cache = sanitizeSettings(JSON.parse(raw));
    } catch {
      // corrupted storage → defaults
    }
  }
  cache ??= SETTINGS_DEFAULTS;
  return cache;
};

const persist = (next: AdminSettings) => {
  cache = next;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // storage unavailable — demo continues in memory
    }
  }
  notify();
};

export const subscribeSettings = (listener: Listener): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const getSettings = (): AdminSettings => ensureLoaded();

export const getSettingsServer = (): AdminSettings => SETTINGS_DEFAULTS;

export const saveSettings = (settings: AdminSettings) =>
  persist(sanitizeSettings(settings));

export const resetSettings = () => {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(SETTINGS_STORAGE_KEY);
  }
  persist(SETTINGS_DEFAULTS);
};
