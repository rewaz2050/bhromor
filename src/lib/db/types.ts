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

export type DbMediaType = "image" | "youtube" | "future_3d";

export type DbReviewStatus = "pending" | "approved" | "hidden" | "flagged";

export interface DbRider {
  id: string;
  user_id: string | null;
  name: string;
  phone: string;
  contact_email: string;
  vehicle: "bicycle" | "bike" | "scooter";
  zone_ids: string[];
  status: "pending" | "active" | "suspended";
  is_online: boolean;
  cash_in_hand: number;
  rating_avg: number;
  rating_count: number;
  created_at: string;
}

export interface DbDeliveryAssignment {
  id: string;
  order_id: string;
  rider_id: string;
  state: "offered" | "accepted" | "picked_up" | "delivered" | "cancelled" | "expired";
  offered_at: string;
  expires_at: string;
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
  status: "pending" | "active" | "suspended";
  is_open: boolean;
  rating_avg: number;
  rating_count: number;
  created_at: string;
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
  type: "percent" | "fixed";
  value: number;
  min_order: number;
  category_id: string | null;
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
  subtotal: number;
  delivery_charge: number;
  discount: number;
  coupon_id: string | null;
  total: number;
  payment: "cod";
  status: DbOrderStatus;
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
}

export interface DbMediaLibrary {
  id: string;
  url: string;
  alt: string;
  label: string;
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
