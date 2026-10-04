/**
 * How a shop is paid (migration 202610020013).
 *
 *   platform    → the customer pays PROSANTI's wallet; PROSANTI pays the shop its
 *                 share later (the model since day one, and the default).
 *   shop_wallet → the customer pays the SHOP's own bKash/Nagad number. The shop
 *                 therefore owes PROSANTI the commission, delivery charge, tip and
 *                 surcharge; the ledger carries that as a negative balance and the
 *                 shop pays it back as a "remittance".
 *
 * COD is the same in both: the rider's cash goes to PROSANTI.
 */

export const SETTLEMENT_MODELS = ["platform", "shop_wallet"] as const;
export type SettlementModel = (typeof SETTLEMENT_MODELS)[number];
export const DEFAULT_SETTLEMENT_MODEL: SettlementModel = "platform";

export const parseSettlementModel = (value: unknown): SettlementModel =>
  value === "shop_wallet" ? "shop_wallet" : DEFAULT_SETTLEMENT_MODEL;

/** Strict parse for admin input. */
export const requireSettlementModel = (value: unknown): SettlementModel | null =>
  typeof value === "string" && (SETTLEMENT_MODELS as readonly string[]).includes(value) ? (value as SettlementModel) : null;

export const SETTLEMENT_LABEL: Record<SettlementModel, string> = {
  platform: "PROSANTI collects, then pays the shop",
  shop_wallet: "Customer pays the shop's own bKash/Nagad",
};

export const SETTLEMENT_HELP: Record<SettlementModel, string> = {
  platform: "Customers pay PROSANTI's wallet; the shop is paid its share (sales − commission) later. COD is the same either way.",
  shop_wallet:
    "Customers pay the shop's own number (single-shop carts only; mixed carts get COD). The shop keeps the money and OWES PROSANTI the commission, delivery charge, tip and surcharge — shown as a negative balance on Payouts, cleared by recording a remittance. Only the shop can verify these payments. COD is unchanged.",
};

const BD_MOBILE = /^01\d{9}$/;

/** "+880 1711-111111" → "01711111111"; anything that is not a BD mobile → "". */
export const normalizeWalletNumber = (value: unknown): string => {
  let digits = typeof value === "string" ? value.replace(/\D/g, "") : "";
  if (digits.length > 11 && digits.startsWith("88")) digits = digits.slice(2);
  return BD_MOBILE.test(digits) ? digits : "";
};

export interface ShopWallets {
  bkash?: string;
  nagad?: string;
}

export interface CartShop {
  id: string;
  name?: string;
  settlementModel: SettlementModel;
  wallets: ShopWallets;
}

export interface OfferedWallets extends ShopWallets {
  /** Whose number the customer is paying. */
  payTo: "platform" | "shop";
  payeeName?: string;
}

/**
 * Which wallet numbers checkout may offer for THIS cart.
 *  - no shop-wallet shop in the cart → PROSANTI's numbers, as before;
 *  - exactly one shop, and it sells into its own wallet → that shop's numbers;
 *  - a shop-wallet shop together with any other shop → none (COD only): one
 *    payment cannot be split between two wallets.
 */
export const walletsForCart = (platform: ShopWallets, shops: readonly CartShop[]): OfferedWallets => {
  const own = shops.filter((s) => s.settlementModel === "shop_wallet");
  if (own.length === 0) return { ...platform, payTo: "platform" };
  if (shops.length === 1) {
    const s = shops[0];
    return { bkash: s.wallets.bkash || undefined, nagad: s.wallets.nagad || undefined, payTo: "shop", payeeName: s.name };
  }
  return { payTo: "shop" };
};

/** Taka label for a shop balance: negative = the shop owes PROSANTI. */
export const balanceKind = (paisa: number): "owed_to_shop" | "owed_by_shop" | "settled" =>
  paisa > 0 ? "owed_to_shop" : paisa < 0 ? "owed_by_shop" : "settled";
