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
  /** 202609300001 — platform wallet owed to the rider (tips, later fees). */
  earnings_balance?: number | string | null;
  /** Round 4 — review audit + KYC (202609260002). */
  review_note?: string | null;
  reviewed_by?: string | null;
  reviewed_by_email?: string | null;
  reviewed_at?: string | null;
  kyc?: Record<string, unknown> | null;
  kyc_submitted_at?: string | null;
  /** 202610020005 — licence expiry (date). */
  licence_expires_on?: string | null;
}

export interface DbDeliveryAssignment {
  id: string;
  order_id: string;
  rider_id: string;
  state:
    | "offered"
    | "accepted"
    | "picked_up"
    | "delivered"
    | "cancelled"
    | "expired"
    /** 202610010001: the final failed delivery attempt — the job is closed. */
    | "failed";
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
  /** 202610010004 — part of `amount` paid from the rider wallet (absent pre-migration). */
  netted_amount?: number | null;
  settled_at: string;
  settled_by: string | null;
}

/** 202609300002 — one rider wallet movement (signed; append-only). */
export interface DbRiderEarning {
  id: string;
  rider_id: string;
  order_id: string | null;
  kind:
    | "tip"
    | "delivery_fee"
    | "cod_handling"
    | "incentive"
    | "payout"
    | "payout_refund"
    | "adjustment"
    | "cod_netting";
  amount: number;
  payout_id: string | null;
  note: string | null;
  created_at: string;
}

/** 202609300002 — a rider's withdrawal request against earnings_balance. */
export interface DbRiderPayoutRequest {
  id: string;
  rider_id: string;
  amount: number;
  method: "bkash" | "nagad" | "bank" | "cash";
  account: string;
  status: "pending" | "paid" | "rejected";
  requested_at: string;
  decided_at: string | null;
  decided_by: string | null;
  decided_by_email: string | null;
  note: string | null;
  reference: string;
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
  /** Cover photo (migration 202609270002) — absent on a DB that has not run it. */
  cover_url?: string | null;
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
  /**
   * B5 (202609280005) — verified-shop badge. Optional: a database that has not
   * run the migration simply has no verification to show. The staff-only
   * columns (note / officer) are read only by the admin list.
   */
  nid_checked?: boolean | null;
  trade_licence_checked?: boolean | null;
  verified_at?: string | null;
  verified_by?: string | null;
  verified_by_email?: string | null;
  verification_note?: string | null;
  /** N6 (202610010002) — who verifies wallet payments; absent before it. */
  payment_verifier?: string | null;
  /** 202610020013 — how the shop is paid, and its own wallet numbers. */
  settlement_model?: string | null;
  wallet_bkash?: string | null;
  wallet_nagad?: string | null;
  /** B6 (202609280006) — holiday dates; absent on a database without it. */
  vacation_start?: string | null;
  vacation_end?: string | null;
  vacation_note?: string | null;
}

export interface DbVendorUser {
  user_id: string;
  shop_id: string;
  role: "owner" | "staff";
  created_at: string;
  /**
   * C1 (202609280007) — the roster needs a name and a login the owner
   * recognises. Optional: rows written before the migration have neither,
   * and the roster falls back to the auth-shaped label in that case.
   */
  display_name?: string | null;
  login_email?: string | null;
  added_by?: string | null;
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
  /** B3 — owner of the code (null = platform coupon; migration 202609280003). */
  shop_id?: string | null;
  created_by?: string | null;
  created_at?: string | null;
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
  /** 202610010001: set on the final failed attempt; staff must resolve it. */
  delivery_failed_at?: string | null;
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
  /** Proven-purchase phone / public order no (migration 202609270004; absent before it). */
  customer_phone?: string | null;
  order_ref?: string | null;
  /** B2 — the shop's public reply (migration 202609280002; absent before it). */
  vendor_reply?: string | null;
  vendor_reply_at?: string | null;
  vendor_reply_by?: string | null;
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
