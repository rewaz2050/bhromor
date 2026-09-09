import type { Order } from "./orders";
import type { AdminSettings } from "./settings-store";

export interface LoyaltyProgress {
  enabled: boolean;
  totalDelivered: number;
  targetOrders: number;
  currentStamps: number; // 0..targetOrders
  completedCycles: number;
  isUnlocked: boolean; // has unlocked the reward at current milestone
  remainingOrders: number;
  percent: number;
  rewardTitle: string;
  rewardDescription: string;
  minOrderTaka: number;
}

export interface LoyaltyUserFilter {
  email?: string | null;
  phone?: string | null;
}

const normalizePhone = (raw?: string | null): string => {
  if (!raw) return "";
  return raw.replace(/\D/g, "");
};

/**
 * Calculates customer loyalty stamp progress based on delivered orders.
 * Only 'delivered' orders count — cancelled, returned, or pending orders are excluded.
 */
export function calculateLoyaltyProgress(
  orders: readonly Order[],
  settings: AdminSettings,
  filter?: LoyaltyUserFilter,
): LoyaltyProgress {
  const target = Math.max(1, settings.loyaltyTargetOrders || 10);
  const minPaisa = Math.max(0, (settings.loyaltyMinOrderAmount || 0) * 100);

  const filterEmail = filter?.email ? filter.email.trim().toLowerCase() : "";
  const filterPhone = normalizePhone(filter?.phone);

  const qualifyingOrders = orders.filter((o) => {
    if (o.status !== "delivered") return false;
    if (minPaisa > 0 && o.total < minPaisa) return false;

    // Check optional email if present on customer or metadata
    if (filterEmail) {
      const orderCustomer = o.customer as unknown as { email?: string };
      const orderEmail = orderCustomer?.email?.trim().toLowerCase();
      if (orderEmail && orderEmail === filterEmail) return true;
    }

    if (filterPhone) {
      const orderPhone = normalizePhone(o.customer?.phone);
      if (orderPhone && (orderPhone.endsWith(filterPhone) || filterPhone.endsWith(orderPhone))) {
        return true;
      }
    }

    // If no specific email/phone filter was passed, include all qualifying delivered orders
    return !filterEmail && !filterPhone;
  });

  const totalDelivered = qualifyingOrders.length;
  const completedCycles = Math.floor(totalDelivered / target);
  const cycleRemainder = totalDelivered % target;

  // If customer has at least 1 cycle and remainder is 0, they just hit target (e.g. 10/10)
  const currentStamps =
    totalDelivered > 0 && cycleRemainder === 0 ? target : cycleRemainder;

  const isUnlocked = totalDelivered >= target;
  const remainingOrders = isUnlocked && cycleRemainder === 0 ? 0 : target - cycleRemainder;
  const percent = Math.min(100, Math.round((currentStamps / target) * 100));

  return {
    enabled: settings.loyaltyEnabled,
    totalDelivered,
    targetOrders: target,
    currentStamps,
    completedCycles,
    isUnlocked,
    remainingOrders,
    percent,
    rewardTitle: settings.loyaltyRewardTitle,
    rewardDescription: settings.loyaltyRewardDescription,
    minOrderTaka: settings.loyaltyMinOrderAmount,
  };
}
