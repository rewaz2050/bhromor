/**
 * PROSANTI admin order domain — mock data + order state machine (§33–34, §75).
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

import { bdt, type Bdt } from "./format";
import { PRODUCTS } from "./catalog";

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
 * so every placed order is shaped exactly like the seeded ones (§70, §75).
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
 * legal for the current status. Timeline entries are appended — this is the
 * `order_status_history` behaviour kept in memory for the demo phase.
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

/* ------------------------------------------------------------------ */
/* Mock seed orders (demo phase — replaces Supabase reads later)       */
/* ------------------------------------------------------------------ */

const now = Date.now();
const min = (n: number) => n * 60_000;

let seq = 0;
const dayTag = new Date(now).toISOString().slice(0, 10).replace(/-/g, "");

const nextId = () => {
  seq += 1;
  return `PS-${dayTag}-${String(1000 + seq * 37).slice(-4)}`;
};

interface SeedSpec {
  status: OrderStatus;
  placedAgoMin: number;
  productIds: string[];
  variantOf?: (i: number) => string;
  qtyOf?: (i: number) => number;
  /** minutes from placement to each subsequent step (capped by delivery) */
  cadence?: number[];
  deliveredInMin?: number;
  name?: string;
  areaIdx?: number;
  note?: string;
}

const AREAS = [
  { zoneId: "z1", zoneName: "Zone A — City Centre", area: "Kandirpar", eta: "40–50 min" },
  { zoneId: "z2", zoneName: "Zone B — Inner Ring", area: "Rampur", eta: "45–55 min" },
  { zoneId: "z1", zoneName: "Zone A — City Centre", area: "Court Road", eta: "40–50 min" },
  { zoneId: "z3", zoneName: "Zone C — Outer Ring", area: "Lalchandpur", eta: "60–75 min" },
];

const CADENCE = {
  // minutes from placement at which each following step is stamped;
  // the array covers every step up to and including its key.
  pending: [],
  confirmed: [2],
  preparing: [2, 7],
  "ready-for-pickup": [2, 7, 12],
  "courier-assigned": [2, 7, 12, 16],
  "out-for-delivery": [2, 7, 12, 16, 20],
} as const;

/** Minutes of the full run-up to delivery (fallback when unspecified). */
const DEFAULT_DELIVERY_MIN = 41;

const seedTimeline = (
  status: OrderStatus,
  createdAt: number,
  deliveredInMin?: number,
): { timeline: OrderTimelineEntry[]; deliveredMinutes?: number } => {
  const timeline: OrderTimelineEntry[] = [
    { status: "pending", at: createdAt },
  ];
  const idx = flowIndex(status);
  if (idx < 0) {
    // cancelled shortly after placement
    timeline.push({
      status: "cancelled",
      at: createdAt + min(3),
      note: "Requested by customer",
    });
    return { timeline };
  }
  const cadence =
    status === "delivered"
      ? CADENCE["out-for-delivery"]
      : CADENCE[status as keyof typeof CADENCE];
  for (let i = 1; i <= idx; i++) {
    const stepMinutes =
      status === "delivered" && i === idx && deliveredInMin
        ? deliveredInMin
        : cadence[i - 1];
    timeline.push({
      status: ORDER_FLOW[i],
      at: createdAt + min(stepMinutes),
    });
  }
  const deliveredMinutes =
    status === "delivered"
      ? (deliveredInMin ?? DEFAULT_DELIVERY_MIN)
      : undefined;
  return { timeline, deliveredMinutes };
};

const makeOrder = (spec: SeedSpec): Order => {
  const createdAt = now - min(spec.placedAgoMin);
  const { timeline, deliveredMinutes } = seedTimeline(
    spec.status,
    createdAt,
    spec.deliveredInMin,
  );
  const zone = AREAS[spec.areaIdx ?? (spec.placedAgoMin % AREAS.length)];
  const items: OrderItem[] = spec.productIds.map((id, i) => {
    const p = PRODUCTS.find((x) => x.id === id) ?? PRODUCTS[0];
    return {
      productId: p.id,
      slug: p.slug,
      name: p.name,
      sku: p.sku,
      variant: spec.variantOf?.(i) ?? `${p.colors[0]} · ${p.sizes[0]}`,
      qty: spec.qtyOf?.(i) ?? (i === 0 ? 1 : 1),
      unitPrice: p.price,
      image: p.media[0]?.src ?? "",
    };
  });
  const subtotal = items.reduce((s, it) => s + it.unitPrice * it.qty, 0);
  const deliveryCharge = zone.zoneId === "z1" ? bdt(50) : zone.zoneId === "z2" ? bdt(70) : bdt(100);
  return {
    id: nextId(),
    createdAt,
    customer: {
      name: spec.name ?? "Customer",
      phone: "01700000000",
      area: zone.area,
      address: "House 12, Road 5",
      note: spec.note,
    },
    zoneId: zone.zoneId,
    zoneName: zone.zoneName,
    etaLabel: zone.eta,
    items,
    subtotal,
    deliveryCharge,
    total: subtotal + deliveryCharge,
    payment: "cod",
    status: spec.status,
    timeline,
    deliveredMinutes,
  };
};

const NAMES = [
  "Rahat Ahmed", "Nusrat Jahan", "Tanjim Hasan", "Farhana Islam",
  "Sabbir Rahman", "Moumita Das", "Arif Chowdhury", "Sumaiya Karim",
  "Imran Hossain", "Tahmina Akter", "Mehedi Sarker", "Lamia Chowdhury",
];

export const MOCK_ORDERS: Order[] = [
  // — today’s operational picture, spread across the day —
  makeOrder({ status: "pending", placedAgoMin: 6, productIds: ["p1", "p4"], name: NAMES[0], areaIdx: 0 }),
  makeOrder({ status: "pending", placedAgoMin: 18, productIds: ["p2"], name: NAMES[1], areaIdx: 1, variantOf: () => "Ivory · XL" }),
  makeOrder({ status: "confirmed", placedAgoMin: 33, productIds: ["p5"], name: NAMES[2], areaIdx: 2 }),
  makeOrder({ status: "preparing", placedAgoMin: 52, productIds: ["p3", "p7"], name: NAMES[3], areaIdx: 0, qtyOf: (i) => (i === 0 ? 2 : 1) }),
  makeOrder({ status: "preparing", placedAgoMin: 70, productIds: ["p6"], name: NAMES[4], areaIdx: 3, variantOf: () => "Deep Teal · M" }),
  makeOrder({ status: "ready-for-pickup", placedAgoMin: 95, productIds: ["p1"], name: NAMES[5], areaIdx: 1, qtyOf: () => 2 }),
  makeOrder({ status: "courier-assigned", placedAgoMin: 130, productIds: ["p4", "p2"], name: NAMES[6], areaIdx: 0 }),
  makeOrder({ status: "out-for-delivery", placedAgoMin: 165, productIds: ["p5", "p7"], name: NAMES[7], areaIdx: 2 }),
  makeOrder({ status: "out-for-delivery", placedAgoMin: 210, productIds: ["p2"], name: NAMES[8], areaIdx: 1 }),
  makeOrder({ status: "delivered", placedAgoMin: 260, deliveredInMin: 41, productIds: ["p3"], name: NAMES[9], areaIdx: 0, qtyOf: () => 1 }),
  makeOrder({ status: "delivered", placedAgoMin: 340, deliveredInMin: 47, productIds: ["p1", "p6"], name: NAMES[10], areaIdx: 3, qtyOf: (i) => (i === 0 ? 1 : 2) }),
  makeOrder({ status: "delivered", placedAgoMin: 430, deliveredInMin: 38, productIds: ["p7"], name: NAMES[11], areaIdx: 1, qtyOf: () => 3 }),
  // — a few from previous days so “today” stays meaningful —
  makeOrder({ status: "delivered", placedAgoMin: 60 * 26, deliveredInMin: 44, productIds: ["p4"], name: NAMES[2], areaIdx: 0 }),
  makeOrder({ status: "cancelled", placedAgoMin: 60 * 30, productIds: ["p5"], name: NAMES[5], areaIdx: 2 }),
  makeOrder({ status: "delivered", placedAgoMin: 60 * 52, deliveredInMin: 52, productIds: ["p2", "p3"], name: NAMES[7], areaIdx: 1 }),
];

/* Demo persistence key — replaced by Supabase `orders` later. */
export const ORDERS_STORAGE_KEY = "prosanti.admin.orders.v1";
