/**
 * Supabase row types — mirrors `supabase/schema.sql` (§41–46).
 * Money is integer paisa everywhere (§69), same as the domain layer.
 */

export type DbOrderStatus =
  | "pending"
  | "confirmed"
  | "preparing"
  | "ready-for-pickup"
  | "courier-assigned"
  | "out-for-delivery"
  | "delivered"
  | "cancelled";

export type DbMediaType = "image" | "video" | "youtube" | "future_3d";

export type DbReviewStatus = "pending" | "approved" | "hidden" | "flagged";

export interface DbRider {
  id: string;
  user_id: string | null;
  name: string;
  phone: string;
  contact_email: string;
  vehicle: "bicycle" | "bike" | "scooter";
  zone_ids: string[];
  status: "pending" | "active" | "suspended" | "rejected";
  is_online: boolean;
  cash_in_hand: number;
  rating_avg: number;
  rating_count: number;
  created_at: string;
  /** Live position from the rider app (ps_rider_update_location). */
  lat?: number | null;
  lng?: number | null;
  last_location_at?: string | null;
  /** Dispatch load counters (maintained by the assignment triggers). */
  current_load?: number | null;
  total_deliveries?: number | null;
  /** P2 #22 — self-declared availability (Dhaka clock); null = always on. */
  avail_from_hour?: number | null;
  avail_to_hour?: number | null;
  avail_days?: number[] | null;
  /** Round 4 — review audit + KYC (202609260002). */
  review_note?: string | null;
  reviewed_by?: string | null;
  reviewed_by_email?: string | null;
  reviewed_at?: string | null;
  kyc?: Record<string, unknown> | null;
  kyc_submitted_at?: string | null;
}

export interface DbDeliveryAssignment {
  id: string;
  order_id: string;
  rider_id: string;
  state: "offered" | "accepted" | "picked_up" | "delivered" | "cancelled" | "expired";
  offered_at: string;
  expires_at: string;
  /** 202609250003: why a cancelled row ended — decline (permanent),
   * withdrawn (cooldown) or superseded (immediately re-invitable). */
  cancelled_by?: "rider_decline" | "withdrawn" | "superseded" | null;
  is_broadcast?: boolean | null;
}

/** A rider's COD pay-in claim — staff approve (settle) or reject it. */
export interface DbSettleClaim {
  id: string;
  rider_id: string;
  amount: number;
  method: string;
  reference: string;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  decided_at: string | null;
  decided_by: string | null;
  note: string | null;
}

export interface DbRiderSettlement {
  id: string;
  rider_id: string;
  amount: number;
  method: string;
  reference: string;
  settled_at: string;
  settled_by: string | null;
}

export interface DbCategory {
  id: string;
  name: string;
  name_bn: string;
  tagline: string;
  image: string;
  subcategories: string[];
  sort_order: number;
  active: boolean;
}

export interface DbShop {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  logo_url: string;
  phone: string;
  contact_email: string;
  address: string;
  zone_ids: string[];
  prep_minutes: number;
  commission_pct: number;
  status: "pending" | "active" | "suspended" | "rejected";
  is_open: boolean;
  rating_avg: number;
  rating_count: number;
  created_at: string;
  /** Round 4 — review audit (202609260002). */
  review_note?: string | null;
  reviewed_by?: string | null;
  reviewed_by_email?: string | null;
  reviewed_at?: string | null;
  /** Free delivery (202609260003) — the shop's own minimum, paisa; null = off. */
  free_delivery_min?: number | string | null;
}

export interface DbVendorUser {
  user_id: string;
  shop_id: string;
  role: "owner" | "staff";
  created_at: string;
}

export interface DbShopLedger {
  id: string;
  shop_id: string;
  order_id: string;
  subtotal: number;
  commission: number;
  payable: number;
  delivery_charge?: number;
  tip_amount?: number;
  surcharge_total?: number;
  created_at: string;
}

export interface DbShopPayout {
  id: string;
  shop_id: string;
  amount: number;
  method: string;
  reference: string;
  paid_at: string;
  paid_by: string | null;
}

export interface DbProduct {
  id: string;
  shop_id: string;
  slug: string;
  name: string;
  name_bn: string;
  sku: string;
  category_id: string;
  subcategory: string;
  short_description: string;
  description: string;
  details: { label: string; value: string }[];
  price: number;
  compare_at_price: number | null;
  featured: boolean;
  is_new: boolean;
  in_stock: boolean;
  low_stock: boolean;
  status: "draft" | "published";
  active: boolean;
  seo_title: string | null;
  seo_description: string | null;
  /** P1 #14 — warranty period in days; null = no warranty on this item. */
  warranty_days?: number | null;
  /** P2 #21 — fabric transparency card fields (shop-declared; null = unset). */
  fabric_gsm?: number | null;
  manufacturer?: string | null;
  test_report_url?: string | null;
  quality_checked?: boolean;
}

export interface DbVariant {
  id: string;
  product_id: string;
  color: string;
  size: string;
  sku: string | null;
  price: number;
  stock: number;
  reserved: number;
  available: number;
  active: boolean;
}

export interface DbMedia {
  id: string;
  product_id: string;
  type: DbMediaType;
  url: string;
  public_id: string | null;
  alt_text: string;
  sort_order: number;
  metadata: Record<string, unknown>;
}

export interface DbZone {
  id: string;
  name: string;
  areas: string[];
  charge: number;
  eta_label: string;
  sort_order: number;
  active: boolean;
}

export interface DbCoupon {
  id: string;
  code: string;
  type: "percent" | "fixed" | "free_delivery";
  value: number;
  min_order: number;
  category_id: string | null;
  zone_id?: string | null;
  max_discount?: number | null;
  description?: string | null;
  valid_from: string | null;
  valid_until: string | null;
  usage_limit: number | null;
  used: number;
  active: boolean;
}

export interface DbOrder {
  id: string;
  shop_id: string;
  order_no: string | null;
  customer_id: string | null;
  customer_name: string;
  customer_phone: string;
  area: string;
  address: string;
  note: string;
  zone_id: string;
  lat?: number | null;
  lng?: number | null;
  distance_km?: number | null;
  scheduled_at?: string | null;
  delivery_window?: string | null;
  is_express?: boolean;
  is_pickup?: boolean;
  is_return?: boolean;
  return_reason?: string | null;
  return_parent_id?: string | null;
  return_status?: string | null;
  return_pickup_at?: string | null;
  pickup_slot?: string | null;
  tip_amount?: number;
  weight_kg?: number | null;
  surcharge_night?: number;
  surcharge_rain?: number;
  surcharge_distance?: number;
  surcharge_express?: number;
  surcharge_weight?: number;
  delivery_proof_url?: string | null;
  delivery_proof_uploaded_at?: string | null;
  delivery_failed_reason?: string | null;
  delivery_attempts?: number;
  subtotal: number;
  delivery_charge: number;
  discount: number;
  coupon_id: string | null;
  total: number;
  /** P1 #8 — 'cod' (default) or a wallet method the shop verifies. */
  payment: "cod" | "bkash" | "nagad";
  /** P1 #8 — TRXID shared by the customer for wallet payments. */
  payment_ref?: string | null;
  /** P1 #8 — wallet verification state ('verified' for COD). */
  payment_status?: "pending_verification" | "verified" | "rejected";
  payment_verified_at?: string | null;
  /** P2 #17 — true when a PROSANTI+ term waived delivery on this order. */
  is_plus?: boolean;
  /** Free delivery threshold (202609260003): who funded the waiver, and how much. */
  free_delivery_by?: "platform" | "shop" | null;
  free_delivery_waived?: number | null;
  status: DbOrderStatus;
  rider_id: string | null;
  delivery_code: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbOrderItem {
  id: string;
  order_id: string;
  product_id: string | null;
  variant_id: string | null;
  name: string;
  sku: string;
  variant: string;
  unit_price: number;
  qty: number;
}

export interface DbOrderHistory {
  id: string;
  order_id: string;
  status: DbOrderStatus;
  note: string | null;
  changed_by: string | null;
  created_at: string;
}

export interface DbReview {
  id: string;
  shop_id: string;
  product_id: string;
  customer_id: string | null;
  author: string;
  rating: number;
  title: string | null;
  body: string;
  status: DbReviewStatus;
  verified: boolean;
  featured: boolean;
  created_at: string;
}

export type DbContactStatus = "new" | "read" | "replied";

export interface DbContactMessage {
  id: string;
  name: string;
  phone: string;
  topic: string;
  message: string;
  status: DbContactStatus;
  created_at: string;
}

export type DbSubscriberStatus = "subscribed" | "unsubscribed";

export interface DbNewsletterSubscriber {
  id: string;
  email: string;
  status: DbSubscriberStatus;
  token: string;
  created_at: string;
  /** P2 #20 — campaign list tag (null = plain footer signup). */
  campaign?: string | null;
}

export interface DbMediaLibrary {
  id: string;
  url: string;
  alt: string;
  label: string;
  /** Added by migration 006 — older rows read as "image". */
  media_type?: string | null;
  created_at: string;
}

export interface DbNotification {
  id: string;
  recipient: string;
  kind: string;
  title: string;
  body: string;
  href: string | null;
  read: boolean;
  created_at: string;
}

export interface DbSiteSetting {
  key: string;
  value: unknown;
}

/* ------------------------------------------------------------------ */
/* Live shopping sessions (P1 #9)                                      */
/* ------------------------------------------------------------------ */

export interface DbLiveSession {
  id: string;
  title: string;
  description: string;
  stream_url: string;
  scheduled_start: string;
  live_at: string | null;
  ended_at: string | null;
  status: "scheduled" | "live" | "ended";
  showing_product_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbLiveSessionProduct {
  session_id: string;
  product_id: string;
  position: number;
}
