/**
 * C3 (2026-09-29) — one shop's whole file, read for the admin detail page.
 *
 * Everything staff currently answer by opening four tabs: is the shop open,
 * who can sign in as it, what does it sell, how many orders has it taken,
 * how much is it owed, and what do shoppers say about it.
 *
 * Deliberately READ-ONLY and deliberately bounded: every list is capped, and
 * the totals the page leads with are computed from capped reads with the cap
 * reported back, so a shop with 10,000 orders is never a slow page and never
 * a page that quietly lies about being complete.
 */

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { mapShop } from "./mappers";
import type {
  DbOrder,
  DbProduct,
  DbReview,
  DbShop,
  DbShopLedger,
  DbShopPayout,
  DbVendorUser,
} from "./types";
import type { Shop } from "@/lib/catalog";
import { listCommissionHistory, type CommissionChange } from "./commission-audit";

/** How far back the page looks. Past this, the card says "of the last N". */
export const DOSSIER_ORDER_WINDOW = 500;
export const DOSSIER_LEDGER_WINDOW = 2000;

export interface AdminShopStaffRow {
  userId: string;
  name: string;
  login: string;
  role: "owner" | "staff";
  addedAt: number | null;
}

export interface AdminShopProductRow {
  id: string;
  name: string;
  slug: string;
  price: number;
  status: string;
  active: boolean;
  inStock: boolean;
}

export interface AdminShopOrderRow {
  id: string;
  orderNo: string;
  status: string;
  total: number;
  at: number | null;
}

export interface AdminShopLedgerRow {
  id: string;
  orderNo: string;
  subtotal: number;
  commission: number;
  payable: number;
  at: number | null;
}

export interface AdminShopPayoutRow {
  id: string;
  amount: number;
  method: string;
  reference: string;
  at: number | null;
}

export interface AdminShopReviewRow {
  id: string;
  rating: number;
  author: string;
  title: string | null;
  body: string;
  status: string;
  reply: string | null;
  at: number | null;
}

export interface AdminShopOrders {
  recent: AdminShopOrderRow[];
  /** Counted inside the window — see `window`. */
  count: number;
  delivered: number;
  cancelled: number;
  /** Orders still to be settled: pending / confirmed / preparing / out for delivery. */
  open: number;
  /** What shoppers paid (cancelled orders excluded), in paisa. */
  revenue: number;
  /** True when the window was hit, so the page can say "last 500". */
  windowFull: boolean;
  window: number;
}

export interface AdminShopLedger {
  /** Total payable the ledger has ever credited to this shop. */
  earned: number;
  /** Total already paid out. */
  paid: number;
  /** What PROSANTI still owes the shop. */
  balance: number;
  lastPayoutAt: number | null;
  lines: AdminShopLedgerRow[];
  payouts: AdminShopPayoutRow[];
}

export interface AdminShopReviews {
  count: number;
  average: number;
  /** Reviews shoppers can see. */
  public: number;
  /** Waiting on staff moderation. */
  pending: number;
  recent: AdminShopReviewRow[];
}

export interface AdminShopCatalog {
  total: number;
  published: number;
  drafts: number;
  hidden: number;
  outOfStock: number;
  sample: AdminShopProductRow[];
  /** True when `total` is a window, not the whole catalog. */
  windowFull: boolean;
}

export interface AdminShopCommission {
  /** The rate on the shop row right now. */
  current: number;
  /** How many times it has been moved (0 when only the join line exists). */
  changes: number;
  /** The newest line — null when there is no trail at all. */
  last: CommissionChange | null;
  lines: CommissionChange[];
  /** False when migration 202609290001 is not installed on this database. */
  available: boolean;
}

export interface AdminShopDetail {
  shop: Shop;
  staff: AdminShopStaffRow[];
  catalog: AdminShopCatalog;
  orders: AdminShopOrders;
  ledger: AdminShopLedger;
  reviews: AdminShopReviews;
  commission: AdminShopCommission;
}

const at = (value: string | null | undefined): number | null => {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
};

const orderNoOf = (row: { id?: string; order_no?: string | null }): string =>
  (row.order_no ?? row.id ?? "").trim();

/** Statuses that mean "the shop still has to do something". */
const OPEN_STATUSES = new Set([
  "pending",
  "confirmed",
  "preparing",
  "ready-for-pickup",
  "rider-assigned",
  "picked-up",
]);
const CANCELLED = new Set(["cancelled", "returned", "refunded"]);
const DELIVERED = new Set(["delivered"]);

/**
 * One shop's file. Returns null when the id is unknown or unreadable — the
 * route turns that into an honest 404, never an empty page that looks like a
 * shop with no orders.
 */
export async function loadAdminShopDetail(
  db: SupabaseClient,
  shopId: string,
): Promise<AdminShopDetail | null> {
  if (!shopId) return null;
  const { data: shopRow, error: shopError } = await db
    .from("shops")
    .select("*")
    .eq("id", shopId)
    .maybeSingle();
  if (shopError || !shopRow) return null;
  const shop = mapShop(shopRow as DbShop);

  const [staffRes, productsRes, ordersRes, ledgerRes, payoutsRes, reviewsRes, commissionRes] =
    await Promise.all([
      // C1 — who can sign in as this shop, newest last (owners first).
      db
        .from("vendor_users")
        .select("user_id,role,display_name,login_email,added_by,created_at")
        .eq("shop_id", shopId)
        .limit(20),
      db
        .from("products")
        .select("id,name,slug,price,status,active,in_stock")
        .eq("shop_id", shopId)
        .limit(500),
      db
        .from("orders")
        .select("id,order_no,status,total,created_at")
        .eq("shop_id", shopId)
        .order("created_at", { ascending: false })
        .limit(DOSSIER_ORDER_WINDOW),
      db
        .from("shop_ledger")
        .select("id,order_id,subtotal,commission,payable,created_at")
        .eq("shop_id", shopId)
        .order("created_at", { ascending: false })
        .limit(DOSSIER_LEDGER_WINDOW),
      db
        .from("shop_payouts")
        .select("id,amount,method,reference,paid_at")
        .eq("shop_id", shopId)
        .order("paid_at", { ascending: false })
        .limit(200),
      db
        .from("reviews")
        .select("id,rating,author,title,body,status,vendor_reply,created_at")
        .eq("shop_id", shopId)
        .order("created_at", { ascending: false })
        .limit(200),
      // C4 — the commission trail. Degraded, never fatal: a database that has
      // not run the migration still shows the rest of the file, and says the
      // history is not installed rather than pretending the rate never moved.
      listCommissionHistory(db, shopId).then(
        (lines) => ({ lines, available: true }),
        () => ({ lines: [] as CommissionChange[], available: false }),
      ),
    ]);

  const staffRows = (staffRes.data ?? []) as Pick<
    DbVendorUser,
    "user_id" | "role" | "display_name" | "login_email" | "created_at"
  >[];
  const staff: AdminShopStaffRow[] = staffRows
    .map((row) => ({
      userId: row.user_id,
      name: (row.display_name ?? "").trim(),
      login: (row.login_email ?? "").trim(),
      role: row.role === "owner" ? ("owner" as const) : ("staff" as const),
      addedAt: at(row.created_at),
    }))
    // The owner is the account that matters; within a role, oldest first.
    .sort((a, b) => (a.role === b.role ? (a.addedAt ?? 0) - (b.addedAt ?? 0) : a.role === "owner" ? -1 : 1));

  const productRows = (productsRes.data ?? []) as Pick<
    DbProduct,
    "id" | "name" | "slug" | "price" | "status" | "active" | "in_stock"
  >[];
  const catalog: AdminShopCatalog = {
    total: productRows.length,
    published: productRows.filter((p) => p.status === "published" && p.active).length,
    drafts: productRows.filter((p) => p.status !== "published").length,
    hidden: productRows.filter((p) => p.status === "published" && !p.active).length,
    outOfStock: productRows.filter((p) => !p.in_stock).length,
    sample: productRows.slice(0, 8).map((p) => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      price: Number(p.price ?? 0),
      status: p.status,
      active: !!p.active,
      inStock: !!p.in_stock,
    })),
    windowFull: productRows.length >= 500,
  };

  const orderRows = (ordersRes.data ?? []) as Pick<
    DbOrder,
    "id" | "order_no" | "status" | "total" | "created_at"
  >[];
  const orders: AdminShopOrders = {
    recent: orderRows.slice(0, 12).map((o) => ({
      id: o.id,
      orderNo: orderNoOf(o as { id?: string; order_no?: string | null }),
      status: o.status,
      total: Number(o.total ?? 0),
      at: at(o.created_at),
    })),
    count: orderRows.length,
    delivered: orderRows.filter((o) => DELIVERED.has(o.status)).length,
    cancelled: orderRows.filter((o) => CANCELLED.has(o.status)).length,
    open: orderRows.filter((o) => OPEN_STATUSES.has(o.status)).length,
    revenue: orderRows.reduce(
      (sum, o) => (CANCELLED.has(o.status) ? sum : sum + Number(o.total ?? 0)),
      0,
    ),
    windowFull: orderRows.length >= DOSSIER_ORDER_WINDOW,
    window: DOSSIER_ORDER_WINDOW,
  };

  const ledgerRows = (ledgerRes.data ?? []) as Pick<
    DbShopLedger,
    "id" | "order_id" | "subtotal" | "commission" | "payable" | "created_at"
  >[];
  // Order numbers for the ledger lines: one extra read, only for the lines
  // actually shown (the table is capped, so this stays small).
  const shownLedger = ledgerRows.slice(0, 10);
  const ledgerOrderIds = [...new Set(shownLedger.map((l) => l.order_id).filter(Boolean))];
  const orderNoById = new Map<string, string>();
  if (ledgerOrderIds.length > 0) {
    const { data: orderRowsForLedger } = await db
      .from("orders")
      .select("id,order_no")
      .in("id", ledgerOrderIds);
    for (const r of ((orderRowsForLedger ?? []) as { id: string; order_no: string | null }[]) ?? []) {
      orderNoById.set(r.id, (r.order_no ?? r.id).trim());
    }
  }
  const payoutRows = (payoutsRes.data ?? []) as Pick<
    DbShopPayout,
    "id" | "amount" | "method" | "reference" | "paid_at"
  >[];
  const earned = ledgerRows.reduce((sum, l) => sum + Number(l.payable ?? 0), 0);
  const paid = payoutRows.reduce((sum, p) => sum + Number(p.amount ?? 0), 0);
  const ledger: AdminShopLedger = {
    earned,
    paid,
    balance: earned - paid,
    lastPayoutAt: payoutRows[0] ? at(payoutRows[0].paid_at) : null,
    lines: shownLedger.map((l) => ({
      id: l.id,
      orderNo: orderNoById.get(l.order_id) ?? "",
      subtotal: Number(l.subtotal ?? 0),
      commission: Number(l.commission ?? 0),
      payable: Number(l.payable ?? 0),
      at: at(l.created_at),
    })),
    payouts: payoutRows.slice(0, 10).map((p) => ({
      id: p.id,
      amount: Number(p.amount ?? 0),
      method: p.method,
      reference: p.reference ?? "",
      at: at(p.paid_at),
    })),
  };

  const reviewRows = (reviewsRes.data ?? []) as Pick<
    DbReview,
    "id" | "rating" | "author" | "title" | "body" | "status" | "created_at" | "vendor_reply"
  >[];
  const ratings = reviewRows.map((r) => Number(r.rating ?? 0)).filter((n) => n > 0);
  const reviews: AdminShopReviews = {
    count: reviewRows.length,
    average: ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0,
    public: reviewRows.filter((r) => r.status === "approved").length,
    pending: reviewRows.filter((r) => r.status === "pending").length,
    recent: reviewRows.slice(0, 5).map((r) => ({
      id: r.id,
      rating: Number(r.rating ?? 0),
      author: r.author ?? "",
      title: r.title ?? null,
      body: r.body ?? "",
      status: r.status,
      reply: r.vendor_reply ?? null,
      at: at(r.created_at),
    })),
  };

  const commissionLines = commissionRes.lines;
  const commission: AdminShopCommission = {
    current: Number(shop.commissionPct ?? 0),
    // The first line is the rate the shop joined with, not a move.
    changes: Math.max(0, commissionLines.length - 1),
    last: commissionLines.at(-1) ?? null,
    lines: commissionLines,
    available: commissionRes.available,
  };

  return { shop, staff, catalog, orders, ledger, reviews, commission };
}
