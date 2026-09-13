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
  isNightHour,
  orderTotal,
  weightExtraCharge,
  NIGHT_SURCHARGE_PAISA,
  RAIN_SURCHARGE_PAISA,
  EXPRESS_SURCHARGE_PAISA,
  FLAT_DELIVERY_CHARGE_PAISA,
} from "./delivery";
import { normalizePhone } from "./orders";
import {
  BUNDLE_DEFAULTS,
  FLASH_DEFAULTS,
  flashDiscountForCart,
  flashState,
  matchBundle,
  pickBestOffer,
  sanitizeBundle,
  sanitizeFlash,
} from "./promos";
import { GIFT_DEFAULTS, giftRiderNote, sanitizeGift, validateGift } from "./gift";
import { REFERRAL_DEFAULTS, redeemReferral, sanitizeReferral } from "./referral";
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
  /** Gift mode (P0 #6) — snake_case, straight from the checkout step. */
  gift?: {
    is_gift?: boolean;
    gift_recipient_name?: string;
    gift_recipient_phone?: string;
    gift_message?: string;
    gift_wrap?: string;
  };
  /** Friend's referral code (P0 #7). */
  referral_code?: string;
  /** P1 #8 — 'cod' (default) | 'bkash' | 'nagad'. */
  payment_method?: string;
  /** P1 #8 — TRXID from the wallet transfer (required for bkash/nagad). */
  payment_ref?: string;
  items: OrderPayloadItem[];
}

export interface OrderSnapshot {
  products: Product[];
  zones: DeliveryZone[];
  coupons: import("./coupons").Coupon[];
  /** Live shop rows (slice 4). Absent in older snapshots → skipped. */
  shops?: Shop[];
  /**
   * Retained for potential future promos — the flat-delivery model does
   * NOT apply a per-user free-delivery rule.
   */
  customerOrderCount?: number;
  /**
   * Retained for potential future promos — the flat-delivery model does
   * NOT apply a store-wide launch offer.
   */
  totalOrders?: number;
  /**
   * Retained for potential future promos — the flat-delivery model does
   * NOT apply a free-delivery threshold.
   */
  freeThresholdEnabled?: boolean;
  /** Evaluation clock (ms). Defaults to Date.now() — tests pin it. */
  now?: number;
  /**
   * The P0 growth levers, straight from the ops settings document. ABSENT means
   * "the server did not arm anything": every lever prices at zero, so an old
   * snapshot (or a test that never opted in) behaves exactly as before. The
   * storefront badges read the same document, which is what keeps a promise and
   * the money from disagreeing.
   */
  promos?: {
    flash?: unknown;
    bundle?: unknown;
    gift?: unknown;
    referral?: unknown;
  };
  /** Issued referral codes (service-role read; never exposed to clients). */
  referralRecords?: import("./referral").ReferralRecord[];
  /**
   * The referral ledger (service-role read). The validator filters it by the
   * buyer's phone: one credit per (code, phone), and no self-referrals.
   */
  referralRewards?: { code: string; refereePhone: string }[];
  /**
   * Phones with at least one earlier non-cancelled order — the first-order
   * proof. Truncated at a few thousand rows on purpose: if this ever misses,
   * ps_place_order still refuses the credit, so the worst case is no discount,
   * never a wrong one.
   */
  priorOrderPhones?: string[];
  /**
   * P1 #8 — the shop's own wallet numbers from the ops settings. A method
   * with no number here is not offered at checkout and cannot be placed.
   */
  payments?: { bkash?: string; nagad?: string };
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
  /** P1 #8 — chosen payment method; 'cod' is the no-friction default. */
  paymentMethod: "cod" | "bkash" | "nagad";
  /** P1 #8 — TRXID the customer shared for wallet payments. */
  paymentRef?: string;
  coupon?: { code: string; discount: number; id: string };
  /** The ONE automatic offer this order earns — flash drop or bundle set. */
  promo?: { kind: "flash" | "bundle"; label: string; discount: number };
  gift?: import("./gift").GiftDraft;
  referral?: { code: string; credit: number };
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
 * default label.
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
  // products always carry shopId. The ps_place_order RPC re-enforces this
  // authoritatively.
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
  // Carts without shopIds skip the check entirely.
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
  const surchargeNight =
    !isPickup && night ? NIGHT_SURCHARGE_PAISA : 0;
  const surchargeRain = !isPickup && isRain ? RAIN_SURCHARGE_PAISA : 0;
  const surchargeExpress =
    !isPickup && isExpress ? EXPRESS_SURCHARGE_PAISA : 0;
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
   * Pickup → free. Free-delivery coupon → free (surcharges waived).
   * Otherwise the flat charge + surcharges. */
  const freeDelivery = isPickup || couponFreeDelivery;
  const deliveryCharge = freeDelivery
    ? 0
    : Math.max(0, FLAT_DELIVERY_CHARGE_PAISA) +
      surchargeNight +
      surchargeRain +
      surchargeExpress +
      surchargeWeight;

  /* ---------------- P0 growth levers ----------------
   * One automatic offer per order (flash drop OR bundle set — the better one
   * wins, ties favour the time-boxed drop), a coupon stacks on top, gift wrap
   * adds a fee, and a referral code credits a first order. The same sanitized
   * settings the storefront badges read, so what is promised is what is
   * priced. ps_place_order re-derives all of it from live rows and drops any
   * discount this layer could not prove. */
  const src = snapshot.promos;
  const flashCfg = src ? sanitizeFlash(src.flash) : { ...FLASH_DEFAULTS, enabled: false };
  const bundleCfg = src ? sanitizeBundle(src.bundle) : { ...BUNDLE_DEFAULTS, enabled: false };
  const giftCfg = src ? sanitizeGift(src.gift) : { ...GIFT_DEFAULTS, enabled: false };
  const refCfg = src ? sanitizeReferral(src.referral) : { ...REFERRAL_DEFAULTS, enabled: false };

  const cartLines = priced.map((it) => ({
    product: it.product,
    qty: it.qty,
    lineTotal: it.lineTotal,
  }));
  const flashOffer = flashDiscountForCart(
    flashCfg,
    flashState(flashCfg, now),
    cartLines,
  );
  const bundleOffer = matchBundle(
    priced.map((it) => ({ product: it.product, qty: it.qty })),
    snapshot.products,
    bundleCfg,
  );
  const bestOffer = pickBestOffer([
    {
      kind: "flash",
      label: `Flash drop — ${flashOffer.pct}% off`,
      discount: flashOffer.discount,
    },
    {
      kind: "bundle",
      label: `${bundleOffer?.name ?? "Complete the look"} — ${bundleOffer?.discountPct ?? 0}% off the set`,
      discount: bundleOffer?.discount ?? 0,
    },
  ]);
  const promoHeadroom = Math.max(0, subtotal - discount);
  const promo =
    bestOffer && bestOffer.kind !== "coupon"
      ? {
          kind: bestOffer.kind as "flash" | "bundle",
          label: bestOffer.label,
          discount: Math.min(bestOffer.discount, promoHeadroom),
        }
      : undefined;
  const promoDiscount = promo?.discount ?? 0;

  /* ---------------- gift mode ---------------- */
  const giftCheck = validateGift(body.gift, giftCfg);
  for (const [field, message] of Object.entries(giftCheck.errors)) {
    if (message) errors.push({ field: `gift.${field}`, message });
  }
  const gift = giftCheck.value;
  const giftFee = gift.isGift ? gift.feePaisa : 0;

  /* ---------------- referral ---------------- */
  let referral: ValidOrderDraft["referral"];
  const rawRef =
    typeof body.referral_code === "string" ? body.referral_code : undefined;
  if (rawRef && rawRef.trim() !== "") {
    const verdict = redeemReferral({
      rawCode: rawRef,
      records: snapshot.referralRecords ?? [],
      buyerOrderCount:
        snapshot.customerOrderCount ??
        (snapshot.priorOrderPhones ?? []).filter(
          (raw) => normalizePhone(raw) === phoneDigits,
        ).length,
      buyerPhone: phoneDigits,
      subtotal,
      cfg: refCfg,
      alreadyRedeemedBy: (snapshot.referralRewards ?? [])
        .filter((r) => normalizePhone(r.refereePhone) === phoneDigits)
        .map((r) => r.code),
    });
    if (!verdict.ok) {
      errors.push({
        field: "referralCode",
        message: verdict.reason ?? "That referral code cannot be used here.",
      });
    } else {
      referral = {
        code: verdict.code,
        credit: Math.min(
          verdict.discount,
          Math.max(0, subtotal - discount - promoDiscount),
        ),
      };
    }
  }

  /* ---------------- payment (P1 #8) ----------------
   * COD is always allowed. A wallet method is only accepted when the shop has
   * actually configured that wallet (an empty number must never be printed in
   * a checkout), and only with a plausible TRXID — ps_place_order re-checks
   * both against the same ops settings. */
  const rawMethod =
    typeof body.payment_method === "string"
      ? body.payment_method.trim().toLowerCase()
      : "cod";
  let paymentMethod: ValidOrderDraft["paymentMethod"] = "cod";
  let paymentRef: string | undefined;
  if (rawMethod === "bkash" || rawMethod === "nagad") {
    const label = rawMethod === "bkash" ? "bKash" : "Nagad";
    const wallet = snapshot.payments?.[rawMethod];
    if (!wallet) {
      errors.push({
        field: "payment",
        message: `${label} is not available right now — please use cash on delivery.`,
      });
    } else {
      paymentMethod = rawMethod;
      const ref =
        typeof body.payment_ref === "string"
          ? body.payment_ref.trim().toUpperCase()
          : "";
      if (!/^[A-Za-z0-9]{6,32}$/.test(ref)) {
        errors.push({
          field: "paymentRef",
          message: `First send the total to ${label}, then enter the TRXID you received.`,
        });
      } else {
        paymentRef = ref;
      }
    }
  } else if (rawMethod !== "cod") {
    errors.push({
      field: "payment",
      message: "Unknown payment method — choose cash on delivery, bKash or Nagad.",
    });
  }

  if (errors.length > 0) return { ok: false, errors };

  // The rider only ever needs one line of context, and the packing slip for a
  // gift must not quote prices — both ride the existing note field, no new
  // column is needed for the handoff.
  const riderNote = giftRiderNote(gift);
  const finalNote = riderNote
    ? `${note ? `${note}\n` : ""}${riderNote}`.slice(0, 500)
    : note;

  const totalDiscount = discount + promoDiscount + (referral?.credit ?? 0);

  return {
    ok: true,
    draft: {
      customer: { name, phone, area: para, district, upazila, para, address, note: finalNote },
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
      surchargeExpress: surchargeExpress,
      surchargeWeight,
      items: priced,
      paymentMethod,
      paymentRef,
      coupon,
      promo,
      gift,
      referral,
      subtotal,
      deliveryCharge,
      discount: totalDiscount,
      total: orderTotal(subtotal, deliveryCharge, totalDiscount) + tipAmount + giftFee,
    },
  };
};
