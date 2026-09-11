/**
 * PROSANTI order domain — order state machine (§33–34, §75).
 *
 * Pure, UI-agnostic module so the state machine and money math can be unit
 * tested. Shapes follow the blueprint's generic commerce model; in the
 * Supabase phase these helpers operate on `orders`/`order_items`/
 * `order_status_history` rows instead of in-memory records.
 *
 * Money is integer paisa throughout (§69). Every order item stores a
 * historical snapshot of the product as purchased (§75) — later price
 * changes never rewrite old orders.
 */

import type { Bdt } from "./format";

/* ------------------------------------------------------------------ */
/* Status model (§34)                                                  */
/* ------------------------------------------------------------------ */

export const ORDER_FLOW = [
  "pending",
  "confirmed",
  "preparing",
  "ready-for-pickup",
  "courier-assigned",
  "out-for-delivery",
  "delivered",
] as const;

export type OrderStatus = (typeof ORDER_FLOW)[number] | "cancelled";

/** Legal transitions. Cancel is an operational decision, allowed early. */
export const TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["preparing", "cancelled"],
  preparing: ["ready-for-pickup", "cancelled"],
  "ready-for-pickup": ["courier-assigned"],
  "courier-assigned": ["out-for-delivery"],
  "out-for-delivery": ["delivered"],
  delivered: [],
  cancelled: [],
};

export const STATUS_META: Record<
  OrderStatus,
  { label: string; short: string }
> = {
  pending: { label: "Pending", short: "New" },
  confirmed: { label: "Confirmed", short: "Confirmed" },
  preparing: { label: "Preparing", short: "Preparing" },
  "ready-for-pickup": { label: "Ready for Pickup", short: "Ready" },
  "courier-assigned": { label: "Courier Assigned", short: "Assigned" },
  "out-for-delivery": { label: "Out for Delivery", short: "Out" },
  delivered: { label: "Delivered", short: "Delivered" },
  cancelled: { label: "Cancelled", short: "Cancelled" },
};

export const isFlowStatus = (s: OrderStatus): boolean =>
  (ORDER_FLOW as readonly string[]).includes(s);

/** Allowed non-cancelling next steps — what the admin may do now. */
export const nextActions = (status: OrderStatus): OrderStatus[] =>
  TRANSITIONS[status].filter((s) => s !== "cancelled");

export const canCancel = (status: OrderStatus): boolean =>
  TRANSITIONS[status].includes("cancelled");

export const isTerminal = (status: OrderStatus): boolean =>
  TRANSITIONS[status].length === 0;

export const transitionAllowed = (
  from: OrderStatus,
  to: OrderStatus,
): boolean => TRANSITIONS[from].includes(to);

/** Position on the happy-path timeline (cancelled → -1, delivered → last). */
export const flowIndex = (status: OrderStatus): number =>
  isFlowStatus(status) ? ORDER_FLOW.indexOf(status as never) : -1;

/* ------------------------------------------------------------------ */
/* Order model                                                         */
/* ------------------------------------------------------------------ */

export interface OrderItem {
  /** Historical snapshot of the product at purchase time (§75). */
  productId: string;
  slug: string;
  name: string;
  sku: string;
  variant: string;
  qty: number;
  unitPrice: Bdt; // paisa at time of purchase
  image: string;
}

export interface OrderTimelineEntry {
  status: OrderStatus;
  at: number; // epoch ms
  note?: string;
}

export interface OrderCustomer {
  name: string;
  phone: string;
  area: string;
  address?: string;
  note?: string;
}

export interface Order {
  /** Public, human-friendly ID — never an internal row id (§70). */
  id: string;
  createdAt: number;
  customer: OrderCustomer;
  zoneId: string;
  zoneName: string;
  etaLabel: string;
  items: OrderItem[];
  subtotal: Bdt;
  deliveryCharge: Bdt;
  total: Bdt;
  payment: "cod";
  status: OrderStatus;
  timeline: OrderTimelineEntry[];
  /** For delivered orders: minutes from placement to doorstep (§88 KPI). */
  deliveredMinutes?: number;
  /** Applied promo code + discount snapshot, when the customer used one (§56). */
  coupon?: { code: string; discount: number };
  /** Owning shop (marketplace slice 1). Live orders always carry it. */
  shopId?: string;
  /** Live 4-digit proof code from the server. */
  deliveryCode?: string;
  /** Geo pin from map — exact delivery location */
  lat?: number;
  lng?: number;
  distanceKm?: number;
  scheduledAt?: number;
  deliveryWindow?: string;
  isExpress?: boolean;
  surchargeNight?: number;
  surchargeRain?: number;
  surchargeDistance?: number;
  surchargeExpress?: number;
  /** Delivery proof photo via Cloudinary */
  deliveryProofUrl?: string;
  deliveryProofUploadedAt?: number;
  deliveryAttempts?: number;
  deliveryFailedReason?: string;
  /** Assigned rider when dispatch has moved the order (slice 9 tracking). */
  rider?: {
    id: string;
    name: string;
    phone: string;
    ratingAvg: number;
    ratingCount: number;
  };
}

export interface PlacedOrderInput {
  id: string;
  createdAt: number;
  customer: {
    name: string;
    phone: string;
    area: string;
    address?: string;
    note?: string;
  };
  zone: { id: string; name: string; etaLabel: string; charge: Bdt };
  coupon?: { code: string; discount: number };
  items: {
    product: { id: string; slug: string; sku: string; name: string; price: Bdt };
    image: string;
    variant: string;
    qty: number;
  }[];
}

/**
 * Turn a completed checkout into an Order record — one public entry point,
 * so every placed order is shaped consistently (§70, §75).
 * Totals are recomputed in paisa, never trusted from the client beyond qty.
 */
export const makePlacedOrder = (input: PlacedOrderInput): Order => {
  const items: OrderItem[] = input.items.map((it) => ({
    productId: it.product.id,
    slug: it.product.slug,
    name: it.product.name,
    sku: it.product.sku,
    variant: it.variant,
    qty: it.qty,
    unitPrice: it.product.price,
    image: it.image,
  }));
  const subtotal = items.reduce((sum, it) => sum + it.unitPrice * it.qty, 0);
  const discount = Math.min(input.coupon?.discount ?? 0, subtotal);
  return {
    id: input.id,
    createdAt: input.createdAt,
    customer: input.customer,
    zoneId: input.zone.id,
    zoneName: input.zone.name,
    etaLabel: input.zone.etaLabel,
    items,
    subtotal,
    deliveryCharge: input.zone.charge,
    coupon: input.coupon ? { ...input.coupon, discount } : undefined,
    total: subtotal - discount + input.zone.charge,
    payment: "cod",
    status: "pending",
    timeline: [{ status: "pending", at: input.createdAt }],
  };
};

/**
 * Compare phone numbers the way a human would: ignore spaces, dashes and a
 * +88 country code. Tracking failed for anyone who typed "+8801..." even
 * though it is the same number.
 */
export const normalizePhone = (phone: string): string => {
  let digits = phone.replace(/\D/g, "");
  if (digits.length > 11 && digits.startsWith("88")) digits = digits.slice(2);
  return digits;
};

export const samePhone = (a: string, b: string): boolean =>
  normalizePhone(a) !== "" && normalizePhone(a) === normalizePhone(b);

export const maskPhone = (phone: string): string => {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 8) return phone;
  return `${digits.slice(0, 3)}****${digits.slice(-2)}`;
};

/* ------------------------------------------------------------------ */
/* Pure state transitions (§34 enforcement)                            */
/* ------------------------------------------------------------------ */

/**
 * Return a new order advanced to `to`, or null when the transition is not
 * legal for the current status. Timeline entries are appended — this mirrors
 * `order_status_history` for the in-memory client helpers.
 */
export const advanceOrder = (
  order: Order,
  to: OrderStatus,
  at: number = Date.now(),
  note?: string,
): Order | null => {
  if (!transitionAllowed(order.status, to)) return null;
  const next: Order = {
    ...order,
    status: to,
    timeline: [...order.timeline, { status: to, at, note }],
  };
  if (to === "delivered") {
    next.deliveredMinutes = Math.max(
      1,
      Math.round((at - order.createdAt) / 60000),
    );
  }
  return next;
};

/* ------------------------------------------------------------------ */
/* Delivery performance stats (§88)                                    */
/* ------------------------------------------------------------------ */

export interface DeliveryStats {
  count: number;
  averageMinutes: number;
  medianMinutes: number;
  under50: number; // orders delivered inside the 50-min promise
  under50Pct: number;
}

export const deliveryStats = (orders: Order[]): DeliveryStats => {
  const mins = orders
    .filter((o) => o.status === "delivered" && o.deliveredMinutes)
    .map((o) => o.deliveredMinutes as number)
    .sort((a, b) => a - b);
  if (mins.length === 0) {
    return {
      count: 0,
      averageMinutes: 0,
      medianMinutes: 0,
      under50: 0,
      under50Pct: 0,
    };
  }
  const sum = mins.reduce((a, b) => a + b, 0);
  const mid = Math.floor(mins.length / 2);
  const median =
    mins.length % 2 ? mins[mid] : Math.round((mins[mid - 1] + mins[mid]) / 2);
  const under50 = mins.filter((m) => m <= 50).length;
  return {
    count: mins.length,
    averageMinutes: Math.round(sum / mins.length),
    medianMinutes: median,
    under50,
    under50Pct: Math.round((under50 / mins.length) * 100),
  };
};

/* ------------------------------------------------------------------ */
/* Dashboard aggregates (§32)                                          */
/* ------------------------------------------------------------------ */

export interface OrderAggregates {
  byStatus: Record<OrderStatus, number>;
  todaySales: Bdt;
  todayOrders: number;
  newOrders: number; // pending, actionable
}

export const aggregateOrders = (orders: Order[]): OrderAggregates => {
  const byStatus = {
    pending: 0,
    confirmed: 0,
    preparing: 0,
    "ready-for-pickup": 0,
    "courier-assigned": 0,
    "out-for-delivery": 0,
    delivered: 0,
    cancelled: 0,
  } as Record<OrderStatus, number>;
  let todaySales = 0;
  let todayOrders = 0;
  const now = Date.now();
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  for (const o of orders) {
    byStatus[o.status] += 1;
    const placedToday = o.createdAt >= dayStart.getTime();
    if (placedToday && o.status !== "cancelled") {
      todayOrders += 1;
      if (o.status !== "pending") todaySales += o.total;
    }
  }
  return {
    byStatus,
    todaySales,
    todayOrders,
    newOrders: byStatus.pending + byStatus.confirmed,
  };
};

/**
 * Deterministically generates a 4-digit verification code from an order ID.
 * Shown to the customer on order tracking and given to the rider upon delivery.
 */
export const getDeliveryCode = (orderId: string): string => {
  let hash = 0;
  const cleanId = orderId.toUpperCase();
  for (let i = 0; i < cleanId.length; i++) {
    hash = (hash * 37 + cleanId.charCodeAt(i)) % 100000;
  }
  const code = (Math.abs(hash) % 9000) + 1000;
  return String(code);
};
