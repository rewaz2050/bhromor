import type { Order } from "./orders";
import type { AdminSettings } from "./settings-store";

export interface LoyaltyProgress {
  enabled: boolean;
  totalDelivered: number;
  targetOrders: number;
  currentStamps: number; // 0..targetOrders
  completedCycles: number;
  isUnlocked: boolean; // has unlocked the reward at current milestone
  prizeRevealed: boolean; // prize name hidden until the first order lands
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
 * Calculates Smart Card stamp progress. Every non-cancelled order earns
 * exactly 1 stamp ("proti order e 1 ta kore stamp porbe") — cancelled orders
 * never count. The admin-controlled prize stays a surprise (prizeRevealed
 * false) until the customer's first order lands.
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
    if (o.status === "cancelled") return false;
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

    // No email/phone filter → count every non-cancelled order (all customers view)
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
    prizeRevealed: totalDelivered >= 1,
    rewardTitle: settings.loyaltyRewardTitle,
    rewardDescription: settings.loyaltyRewardDescription,
    minOrderTaka: settings.loyaltyMinOrderAmount,
  };
}
