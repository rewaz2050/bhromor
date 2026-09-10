/**
 * Checkout order validation — shared by the POST /api/orders route and unit
 * tests. Pure: takes the raw client payload plus a server-loaded snapshot
 * (products, zones, coupons) and returns either field errors or a fully
 * priced order draft.
 *
 * Security posture: the client payload is NEVER trusted for money. Prices
 * come from the snapshot, discounts are recomputed, totals are re-derived.
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
import { deliveryChargeFor, orderTotal } from "./delivery";
import { normalizePhone } from "./orders";
import { haversineKm, SUNAMGANJ_HUB_COORDS, type LatLng } from "./sunamganj";

export interface OrderPayloadItem {
  productId: string;
  variantLabel: string;
  qty: number;
}

export interface OrderPayload {
  name: string;
  phone: string;
  area: string;
  address: string;
  note?: string;
  zoneId: string;
  lat?: number;
  lng?: number;
  distance_km?: number;
  couponCode?: string;
  items: OrderPayloadItem[];
}

export interface OrderSnapshot {
  products: Product[];
  zones: DeliveryZone[];
  coupons: import("./coupons").Coupon[];
  /** Live shop rows (slice 4). Absent in demo-era snapshots → skipped. */
  shops?: Shop[];
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
  customer: { name: string; phone: string; area: string; address: string; note: string };
  zone: DeliveryZone;
  geo?: { lat: number; lng: number; distanceKm: number } | null;
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
  const area = clean(body.area, 120);
  const address = clean(body.address, 800); // Sunamganj full address with District/Upazila + house/road
  const note = clean(body.note, 500);
  const zoneId = clean(body.zoneId, 64);
  const latRaw = (body as any).lat;
  const lngRaw = (body as any).lng;
  const lat = typeof latRaw === 'number' ? latRaw : typeof latRaw === 'string' ? parseFloat(latRaw) : undefined;
  const lng = typeof lngRaw === 'number' ? lngRaw : typeof lngRaw === 'string' ? parseFloat(lngRaw) : undefined;
  const distRaw = (body as any).distance_km ?? (body as any).distanceKm;
  const distanceKm = typeof distRaw === 'number' ? distRaw : typeof distRaw === 'string' ? parseFloat(distRaw) : undefined;
  let geo: ValidOrderDraft['geo'] = null;
  if (typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
    const computed = haversineKm(SUNAMGANJ_HUB_COORDS as LatLng, { lat, lng });
    const dist = typeof distanceKm === 'number' && Number.isFinite(distanceKm) && distanceKm >= 0 ? distanceKm : computed;
    geo = { lat, lng, distanceKm: dist };
  }
  const couponCode =
    typeof body.couponCode === "string" && body.couponCode.trim() !== ""
      ? normalizeCode(body.couponCode)
      : undefined;

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
  if (area.length < 2) {
    errors.push({ field: "area", message: "Please share your area." });
  }
  if (address.length < 8) {
    errors.push({
      field: "address",
      message: "Please share a full delivery address.",
    });
  }

  const zone = snapshot.zones.find(
    (z) => z.id === zoneId && z.active !== false,
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
    if (!shop.zoneIds.includes(zone.id)) {
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
  // Zone D (outside Sadar) requires minimum ৳500
  if (zone.id === "z4" && subtotal < 50000) {
    return {
      ok: false,
      errors: [
        {
          field: "items",
          message: `Zone D (Sunamganj Sadar outside) requires minimum ৳500 order — add ৳${Math.ceil((50000 - subtotal) / 100)} more.`,
        },
      ],
    };
  }
  let deliveryCharge = deliveryChargeFor(zone.charge, subtotal);

  let coupon: ValidOrderDraft["coupon"];
  let discount = 0;
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
      deliveryCharge = 0;
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

  return {
    ok: true,
    draft: {
      customer: { name, phone, area, address, note },
      zone,
      geo,
      items: priced,
      coupon,
      subtotal,
      deliveryCharge,
      discount,
      total: orderTotal(subtotal, deliveryCharge, discount),
    },
  };
};
