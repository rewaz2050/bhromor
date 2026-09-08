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

export interface DbProduct {
  id: string;
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
