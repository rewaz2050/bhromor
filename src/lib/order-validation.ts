/**
 * Checkout order validation — shared by the POST /api/orders route and unit
 * tests. Pure: takes the raw client payload plus a server-loaded snapshot
 * (products, zones, coupons) and returns either field errors or a fully
 * priced order draft.
 *
 * Security posture: the client payload is NEVER trusted for money. Prices
 * come from the snapshot, discounts are recomputed, totals are re-derived.
 * Surcharges (night/rain/express/distance/weight) are computed HERE from
 * server-side facts — the client only sends the raw inputs (pin, flags).
 * The route persists only what this module approves.
 */

import { MAX_LINE_QTY, type CartLine } from "./cart";
import type { DeliveryZone, Product, Shop } from "./catalog";
import {
  discountAmount,
  eligibleSubtotal,
  findCoupon,
  isCouponRedeemable,
  isFreeDeliveryCoupon,
  normalizeCode,
} from "./coupons";
import {
  distanceExtraCharge,
  deliveryChargeFor,
  isNightHour,
  orderTotal,
  promoFreeDelivery,
  weightExtraCharge,
  NIGHT_SURCHARGE_PAISA,
  RAIN_SURCHARGE_PAISA,
  EXPRESS_SURCHARGE_PAISA,
} from "./delivery";
import { normalizePhone } from "./orders";
import {
  deriveZoneChoice,
  haversineKm,
  SUNAMGANJ_DISTRICT,
  SUNAMGANJ_HUB_COORDS,
  SUNAMGANJ_UPAZILA,
  type LatLng,
} from "./sunamganj";

export interface OrderPayloadItem {
  productId: string;
  variantLabel: string;
  qty: number;
}

export interface OrderPayload {
  name: string;
  phone: string;
  /** Simple-form fields — district/upazila/para drive the zone server-side. */
  district?: string;
  upazila?: string;
  para?: string;
  area?: string;
  address: string;
  note?: string;
  zoneId?: string;
  /** Exact pin from the map (optional) — sets geo + distance surcharge. */
  lat?: number | string;
  lng?: number | string;
  distance_km?: number | string;
  /** Scheduled delivery (optional). */
  scheduled_at?: string;
  delivery_window?: string;
  is_express?: boolean;
  /** Store pickup at Traffic Point (optional). */
  is_pickup?: boolean;
  pickup_slot?: string;
  /** Rider tip in paisa (optional, 0-50000). */
  tip_amount?: number;
  /** Package weight hint in kg (optional, 0-50). */
  weight_kg?: number;
  /** Rain surcharge flag (admin toggle is client-side). */
  is_rain?: boolean;
  couponCode?: string;
  items: OrderPayloadItem[];
}

export interface OrderSnapshot {
  products: Product[];
  zones: DeliveryZone[];
  coupons: import("./coupons").Coupon[];
  /** Live shop rows (slice 4). Absent in demo-era snapshots → skipped. */
  shops?: Shop[];
  /**
   * THIS customer's earlier order count (by normalized phone, cancelled
   * excluded) — drives the per-user first-10-free promo. Undefined → the
   * promo is NOT granted (fail closed).
   */
  customerOrderCount?: number;
  /** Evaluation clock (ms). Defaults to Date.now() — tests pin it. */
  now?: number;
}

export interface PricedOrderItem {
  product: Product;
  variantLabel: string;
  variantId?: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
}

export interface ValidOrderDraft {
  customer: {
    name: string;
    phone: string;
    area: string;
    district: string;
    upazila: string;
    para: string;
    address: string;
    note: string;
  };
  zone: DeliveryZone;
  geo?: { lat: number; lng: number; distanceKm: number } | null;
  scheduledAt?: string | null;
  deliveryWindow?: string | null;
  isExpress?: boolean;
  isPickup?: boolean;
  pickupSlot?: string | null;
  tipAmount?: number;
  weightKg?: number;
  surchargeNight?: number;
  surchargeRain?: number;
  surchargeDistance?: number;
  surchargeExpress?: number;
  surchargeWeight?: number;
  items: PricedOrderItem[];
  coupon?: { code: string; discount: number; id: string };
  subtotal: number;
  deliveryCharge: number;
  discount: number;
  total: number;
}

export type OrderValidation =
  | { ok: true; draft: ValidOrderDraft }
  | { ok: false; errors: { field: string; message: string }[] };

const BD_PHONE = /^(?:\+?88)?01[0-9]{9}$/;

const clean = (value: unknown, max: number): string =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

const num = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
};

const parseVariant = (label: string): { color: string; size: string } => {
  const [color = "", size = ""] = label.split("·").map((s) => s.trim());
  return { color, size };
};

/**
 * A variant label is plausible when its color/size (when present in the
 * catalog) match the product. Products without colours/sizes accept the
 * default label — the demo seeds predate per-variant rows.
 */
const variantPlausible = (product: Product, label: string): boolean => {
  if (label === "" || label.length > 120) return false;
  const { color, size } = parseVariant(label);
  if (product.colors.length > 0 && color !== "") {
    if (!product.colors.includes(color)) return false;
  }
  if (product.sizes.length > 0 && size !== "") {
    if (!product.sizes.includes(size)) return false;
  }
  return true;
};

export const validateOrderPayload = (
  raw: unknown,
  snapshot: OrderSnapshot,
): OrderValidation => {
  const errors: { field: string; message: string }[] = [];
  const body = (raw ?? {}) as Partial<OrderPayload>;
  const now = snapshot.now ?? Date.now();

  const name = clean(body.name, 120);
  const phone = clean(body.phone, 20).replace(/[\s-]/g, "");
  const paraRaw = typeof body.para === "string" && body.para.trim() !== "" ? body.para : body.area;
  const para = clean(paraRaw, 120);
  const districtRaw = typeof body.district === "string" && body.district.trim() !== "" ? body.district : SUNAMGANJ_DISTRICT;
  const district = clean(districtRaw, 80);
  const upazilaRaw = typeof body.upazila === "string" && body.upazila.trim() !== "" ? body.upazila : SUNAMGANJ_UPAZILA;
  const upazila = clean(upazilaRaw, 80);
  const address = clean(body.address, 800); // Sunamganj full address with District/Upazila + house/road
  const note = clean(body.note, 500);
  const couponCode =
    typeof body.couponCode === "string" && body.couponCode.trim() !== ""
      ? normalizeCode(body.couponCode)
      : undefined;

  /* ---------------- geo pin (map) ---------------- */
  const lat = num(body.lat);
  const lng = num(body.lng);
  let geo: ValidOrderDraft["geo"] = null;
  if (
    typeof lat === "number" &&
    typeof lng === "number" &&
    lat >= -90 && lat <= 90 &&
    lng >= -180 && lng <= 180
  ) {
    // Distance is always recomputed server-side from the pin.
    geo = { lat, lng, distanceKm: haversineKm(SUNAMGANJ_HUB_COORDS as LatLng, { lat, lng }) };
  } else {
    const clientDist = num(body.distance_km);
    if (typeof clientDist === "number" && clientDist >= 0 && clientDist <= 200) {
      geo = { distanceKm: clientDist } as ValidOrderDraft["geo"];
    }
  }

  /* ---------------- schedule / flags / extras ---------------- */
  const scheduledAt =
    typeof body.scheduled_at === "string" && body.scheduled_at.trim() !== ""
      ? body.scheduled_at.trim().slice(0, 40)
      : null;
  const deliveryWindow =
    typeof body.delivery_window === "string" && body.delivery_window.trim() !== ""
      ? body.delivery_window.trim().slice(0, 20)
      : null;
  const isExpress = body.is_express === true || deliveryWindow === "express";
  const isPickup = body.is_pickup === true;
  const pickupSlot =
    typeof body.pickup_slot === "string" && body.pickup_slot.trim() !== ""
      ? body.pickup_slot.trim().slice(0, 20)
      : null;
  const tipRaw = num(body.tip_amount);
  const tipAmount = Math.max(0, Math.min(50000, Math.floor(tipRaw ?? 0)));
  const weightRaw = num(body.weight_kg);
  const weightKg = Math.max(0, Math.min(50, weightRaw ?? 0));
  const isRain = body.is_rain === true;

  if (name.length < 2) {
    errors.push({ field: "name", message: "Please share your full name." });
  }
  const phoneDigits = normalizePhone(phone);
  if (!BD_PHONE.test(phone) && !(phoneDigits.length === 11 && phoneDigits.startsWith("01"))) {
    errors.push({
      field: "phone",
      message: "A valid Bangladeshi mobile number is required.",
    });
  }
  if (para.length < 2) {
    errors.push({ field: "area", message: "Please pick or type your para / village." });
  }
  if (address.length < 8) {
    errors.push({
      field: "address",
      message: "Please share a full delivery address.",
    });
  }

  // Zone is ALWAYS derived server-side from district/upazila/para — the
  // client cannot pick a cheaper zone than the address deserves.
  const derivedZoneId = deriveZoneChoice(district, upazila, para).zoneId;
  const zone = snapshot.zones.find(
    (z) => z.id === derivedZoneId && z.active !== false,
  );
  if (!zone) {
    errors.push({
      field: "zoneId",
      message: "That delivery zone is not available.",
    });
  }

  const rawItems = Array.isArray(body.items) ? body.items : [];
  if (rawItems.length === 0 || rawItems.length > 20) {
    errors.push({
      field: "items",
      message: "The order must contain 1–20 line items.",
    });
  }

  const priced: PricedOrderItem[] = [];
  const seen = new Set<string>();
  rawItems.slice(0, 20).forEach((line, i) => {
    const l = (line ?? {}) as Partial<CartLine & { productId: string; variantLabel: string }>;
    const productId = clean(l.productId, 64);
    const variantLabel = clean(l.variantLabel, 120);
    const qty = typeof l.qty === "number" ? Math.floor(l.qty) : NaN;
    const field = `items[${i}]`;
    const product = snapshot.products.find((p) => p.id === productId);
    if (!product) {
      errors.push({ field, message: "That product is not available." });
      return;
    }
    const published = (product.status ?? "published") === "published";
    if (!published || product.active === false || !product.inStock) {
      errors.push({
        field,
        message: `“${product.name}” is not available right now.`,
      });
      return;
    }
    if (!Number.isFinite(qty) || qty < 1 || qty > MAX_LINE_QTY) {
      errors.push({
        field,
        message: `Quantity must be between 1 and ${MAX_LINE_QTY}.`,
      });
      return;
    }
    if (!variantPlausible(product, variantLabel)) {
      errors.push({
        field,
        message: `That variant of “${product.name}” is not available.`,
      });
      return;
    }
    const key = `${productId}::${variantLabel}`;
    if (seen.has(key)) {
      errors.push({ field, message: "Duplicate line item." });
      return;
    }
    seen.add(key);
    priced.push({
      product,
      variantLabel,
      qty,
      unitPrice: product.price,
      lineTotal: product.price * qty,
    });
  });

  if (errors.length > 0) return { ok: false, errors };
  if (!zone) return { ok: false, errors }; // narrowed above; keeps TS honest

  // Single-shop rule (D1, Foodpanda model): one order = one shop. Live
  // products always carry shopId; demo seeds omit it and skip the check.
  // The ps_place_order RPC re-enforces this authoritatively.
  const shopIds = new Set(
    priced.map((it) => it.product.shopId).filter((s): s is string => !!s),
  );
  if (shopIds.size > 1) {
    return {
      ok: false,
      errors: [
        {
          field: "items",
          message:
            "One order can only contain items from one shop — check out each shop's bag separately.",
        },
      ],
    };
  }

  // Shop availability (slice 4): the RPC re-enforces this authoritatively,
  // but field-level errors here read better than a placement failure.
  // Demo carts (no shopIds, no shops) skip the check entirely.
  if (snapshot.shops && shopIds.size === 1) {
    const shopId = [...shopIds][0];
    const shop = snapshot.shops.find((s) => s.id === shopId);
    if (!shop || shop.status !== "active") {
      return {
        ok: false,
        errors: [
          {
            field: "items",
            message: "That shop isn't taking orders right now.",
          },
        ],
      };
    }
    if (!shop.isOpen) {
      return {
        ok: false,
        errors: [
          {
            field: "items",
            message: `“${shop.name}” is closed right now — your bag will keep until it reopens.`,
          },
        ],
      };
    }
    if (!isPickup && !shop.zoneIds.includes(zone.id)) {
      return {
        ok: false,
        errors: [
          {
            field: "zoneId",
            message: `“${shop.name}” doesn't deliver to ${zone.name} — pick another zone or shop.`,
          },
        ],
      };
    }
  }

  const subtotal = priced.reduce((s, it) => s + it.lineTotal, 0);
  // Zone D (outside Sadar / other district) requires minimum ৳500
  if (zone.id === "z4" && subtotal < 50000) {
    return {
      ok: false,
      errors: [
        {
          field: "items",
          message: `Outside Sunamganj Sadar requires minimum ৳500 order — add ৳${Math.ceil((50000 - subtotal) / 100)} more.`,
        },
      ],
    };
  }

  /* ---------------- surcharges — computed SERVER-side ---------------- */
  const night = isNightHour(new Date(now).getHours());
  const distanceKm = geo?.distanceKm;
  // Distance extra only inside the city zones; Zone D's flat ৳100 covers it.
  const distanceExtra =
    zone.id !== "z4" ? distanceExtraCharge(distanceKm) : 0;
  const surchargeNight =
    !isPickup && night ? NIGHT_SURCHARGE_PAISA : 0;
  const surchargeRain = !isPickup && isRain ? RAIN_SURCHARGE_PAISA : 0;
  const surchargeExpress =
    !isPickup && isExpress ? EXPRESS_SURCHARGE_PAISA : 0;
  const surchargeDistance = !isPickup ? distanceExtra : 0;
  const surchargeWeight = !isPickup ? weightExtraCharge(weightKg) : 0;

  /* ---------------- coupons ---------------- */
  let coupon: ValidOrderDraft["coupon"];
  let discount = 0;
  let couponFreeDelivery = false;
  if (couponCode) {
    const found = findCoupon(snapshot.coupons, couponCode);
    if (!found) {
      return {
        ok: false,
        errors: [{ field: "couponCode", message: "Unknown code — double-check the spelling." }],
      };
    }
    const redeemable = isCouponRedeemable(found, subtotal, zone.id, now);
    if (!redeemable.ok) {
      return {
        ok: false,
        errors: [
          { field: "couponCode", message: redeemable.reason ?? "This code cannot be used." },
        ],
      };
    }
    if (isFreeDeliveryCoupon(found)) {
      couponFreeDelivery = true;
      discount = 0;
      coupon = { code: found.code, discount: 0, id: found.id };
    } else {
      const eligible = eligibleSubtotal(
        found,
        priced.map((it) => ({
          productCategory: it.product.category,
          subtotal: it.lineTotal,
        })),
      );
      if (eligible <= 0) {
        return {
          ok: false,
          errors: [
            {
              field: "couponCode",
              message: "This code does not apply to the items in your cart.",
            },
          ],
        };
      }
      discount = Math.min(discountAmount(found, eligible), subtotal);
      coupon = { code: found.code, discount, id: found.id };
    }
  }

  /* ---------------- delivery charge ----------------
   * Pickup → free. First-10 promo (Zone A only) or a free-delivery
   * coupon → free (surcharges waived too). Otherwise the flat zone
   * charge + surcharges. */
  const freeDelivery =
    isPickup || couponFreeDelivery || promoFreeDelivery(snapshot.customerOrderCount, zone.id);
  const deliveryCharge = freeDelivery
    ? 0
    : deliveryChargeFor(zone.charge, subtotal) +
      surchargeNight +
      surchargeRain +
      surchargeExpress +
      surchargeDistance +
      surchargeWeight;

  return {
    ok: true,
    draft: {
      customer: { name, phone, area: para, district, upazila, para, address, note },
      zone,
      geo,
      scheduledAt,
      deliveryWindow,
      isExpress,
      isPickup,
      pickupSlot,
      tipAmount,
      weightKg,
      surchargeNight,
      surchargeRain,
      surchargeDistance,
      surchargeExpress,
      surchargeWeight,
      items: priced,
      coupon,
      subtotal,
      deliveryCharge,
      discount,
      total: orderTotal(subtotal, deliveryCharge, discount) + tipAmount,
    },
  };
};
