/**
 * Server-side order pipeline (blueprint §33–34, §75).
 *
 * - `loadOrderSnapshot()` — one batched read of everything checkout needs
 *   to price an order (products + variants + media + zones + coupons).
 * - `placeLiveOrder()` — persists a validated draft through the atomic
 *   `ps_place_order` RPC: row-locked stock reservation, coupon increment,
 *   order + snapshots + history in ONE transaction. Money comes from the
 *   draft, which the validator priced from this same snapshot — the client
 *   never sets a total — and the RPC re-validates authoritatively.
 * - `findLiveOrder()` — phone-gated tracking lookup. Returns null on any
 *   mismatch so callers cannot probe which half of (id, phone) was wrong.
 *
 * All functions return null when the service role is unconfigured; routes
 * answer with an honest 503 in that case.
 */

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseService } from "../supabase-server";
import type { Coupon } from "../coupons";
import type { DeliveryZone, Product, Shop } from "../catalog";
import { mapCoupon, mapOrder, mapProduct, mapShop, mapZone } from "./mappers";
import type {
  DbCoupon,
  DbMedia,
  DbOrder,
  DbOrderHistory,
  DbOrderItem,
  DbProduct,
  DbShop,
  DbVariant,
  DbZone,
} from "./types";
import { normalizePhone, type Order } from "../orders";
import { sanitizeBundle, sanitizeFlash } from "../promos";
import { sanitizeGift } from "../gift";
import { normalizeRefCode, sanitizeReferral, type ReferralRecord } from "../referral";
import { sanitizeSettings } from "../settings-store";
import type { ValidOrderDraft } from "../order-validation";

export interface OrderSnapshot {
  products: Product[];
  zones: DeliveryZone[];
  coupons: Coupon[];
  variants: DbVariant[];
  mediaByProduct: Map<string, string>;
  /** All shops (validator checks active/open/zone itself). */
  shops: Shop[];
  /**
   * Total orders ever placed (global stat). No longer read on the checkout
   * path (audit 2026-09-17 P1.4 — it was a `count(*)` over the orders table
   * on every order and coupon check, and nothing priced from it).
   */
  totalOrders?: number;
  /** THIS customer's earlier non-cancelled order count (first-order proof). */
  customerOrderCount?: number;
  /** ৳1000+-always-free toggle (ops) — retained for future promos. */
  freeThresholdEnabled?: boolean;
  /**
   * The P0 growth levers, sanitized from site_settings['ops'] — the SAME
   * document the storefront badges read. A client cannot invent a discount:
   * only what the shop armed here (and ps_place_order re-derives) is priced.
   */
  promos?: {
    flash: ReturnType<typeof sanitizeFlash>;
    bundle: ReturnType<typeof sanitizeBundle>;
    gift: ReturnType<typeof sanitizeGift>;
    referral: ReturnType<typeof sanitizeReferral>;
  };
  /** Issued referral codes with their reward counts (ledger). */
  referralRecords?: ReferralRecord[];
  /** Referee phones that already took a credit, per code. */
  referralRewards?: { code: string; refereePhone: string }[];
  /** Phones with an earlier non-cancelled order — first-order proof. */
  priorOrderPhones?: string[];
  /** P1 #8 — configured wallet numbers (empty/absent = not offered). */
  payments?: { bkash?: string; nagad?: string };
}

/**
 * How many orders has THIS customer (by normalized phone) already placed?
 * Drives the Smart Card stamp count (loyalty). Cancelled orders do not count.
 * Counts in JS so the phone normalization matches normalizePhone exactly.
 */
export async function countOrdersForPhone(
  db: SupabaseClient,
  phone: string,
): Promise<number> {
  const digits = normalizePhone(phone);
  if (digits === "") return 0;
  const { data, error } = await db
    .from("orders")
    .select("customer_phone")
    .neq("status", "cancelled")
    // P1.4: let Postgres drop the other customers' rows instead of shipping
    // every phone in the table to the function on each call.
    .ilike("customer_phone", phoneNeedle(digits));
  if (error) return 0; // fail closed → no free-delivery grant on DB errors
  return ((data ?? []) as { customer_phone: string }[]).filter(
    (row) => normalizePhone(row.customer_phone) === digits,
  ).length;
}

/**
 * `%1%7%1%…%` — an ILIKE needle that matches ANY stored spelling of the
 * number (bare, +88-prefixed, with spaces or dashes) by requiring its last
 * ten digits in order. It over-matches by design; callers still compare with
 * `normalizePhone` exactly. Digits only, so it is safe inside a filter.
 */
const phoneNeedle = (digits: string): string =>
  `%${digits.replace(/\D/g, "").slice(-10).split("").join("%")}%`;

/**
 * What the caller already knows about the order being priced. Every field
 * is optional — a bare call still returns a complete snapshot — but the
 * hints let the read skip what this request cannot need:
 *
 * - `scope: "pricing"` (coupon best/validate): products, variants, media,
 *   zones and coupons only — no shops, ops, referral or phone reads.
 * - `phone`: scopes the first-order proof (and any referral redemptions) to
 *   this customer instead of reading up to 5000 phones.
 * - `referralCode`: the referral ledger is read ONLY when a code was typed,
 *   and only the rows for that code / this phone.
 */
export interface SnapshotHints {
  scope?: "checkout" | "pricing";
  phone?: string;
  referralCode?: string;
}

const emptyResult = { data: [] as never[], error: null, count: null };

export async function loadOrderSnapshot(
  hints: SnapshotHints = {},
): Promise<OrderSnapshot | null> {
  const db = getSupabaseService();
  if (!db) return null;

  const pricingOnly = hints.scope === "pricing";
  const phoneDigits = normalizePhone(hints.phone ?? "");
  const refCode = normalizeRefCode(hints.referralCode);
  // The referral ledger matters only when a well-formed code was typed; the
  // validator answers format errors itself without touching the records.
  const wantReferral = !pricingOnly && refCode !== "";
  const wantPhoneScope = wantReferral && phoneDigits !== "";

  const [
    productsRes,
    variantsRes,
    mediaRes,
    zonesRes,
    couponsRes,
    shopsRes,
    opsRes,
    codesRes,
    codeRewardsRes,
    phoneRewardsRes,
    phoneOrdersRes,
  ] = await Promise.all([
    db.from("products").select("*").eq("status", "published").eq("active", true),
    db.from("product_variants").select("*").eq("active", true),
    db.from("product_media").select("*").order("sort_order"),
    db.from("delivery_zones").select("*").eq("active", true),
    db.from("coupons").select("*").eq("active", true),
    pricingOnly ? emptyResult : db.from("shops").select("*"),
    // ৳1000+-always-free toggle + wallets + promo levers; read failure keeps
    // the defaults.
    pricingOnly
      ? { data: null, error: null }
      : db.from("site_settings").select("value").eq("key", "ops").maybeSingle(),
    // P0 growth reads. Missing tables (pre-migration) answer an error object,
    // never a throw — every lever simply prices at zero until they exist.
    wantReferral
      ? db
          .from("referral_codes")
          .select("code,customer_id,customer_phone,customer_name")
          .eq("code", refCode)
      : emptyResult,
    wantReferral
      ? db.from("referral_rewards").select("code,referee_phone").eq("code", refCode)
      : emptyResult,
    wantPhoneScope
      ? db
          .from("referral_rewards")
          .select("code,referee_phone")
          .ilike("referee_phone", phoneNeedle(phoneDigits))
      : emptyResult,
    wantPhoneScope
      ? db
          .from("orders")
          .select("customer_phone")
          .neq("status", "cancelled")
          .ilike("customer_phone", phoneNeedle(phoneDigits))
      : emptyResult,
  ]);
  if (
    productsRes.error ||
    variantsRes.error ||
    mediaRes.error ||
    zonesRes.error ||
    couponsRes.error ||
    shopsRes.error
  ) {
    throw new Error("order snapshot read failed");
  }

  const variants = (variantsRes.data ?? []) as DbVariant[];
  const media = (mediaRes.data ?? []) as DbMedia[];
  const products = ((productsRes.data ?? []) as DbProduct[]).map((p) =>
    mapProduct({
      product: p,
      variants: variants.filter((v) => v.product_id === p.id),
      media: media.filter((m) => m.product_id === p.id),
    }),
  );
  const mediaByProduct = new Map<string, string>();
  for (const m of media) {
    if (m.type === "image" && !mediaByProduct.has(m.product_id)) {
      mediaByProduct.set(m.product_id, m.url);
    }
  }
  const zones = ((zonesRes.data ?? []) as DbZone[]).map(mapZone);
  const coupons = ((couponsRes.data ?? []) as DbCoupon[]).map(mapCoupon);
  if (pricingOnly) {
    return { products, zones, coupons, variants, mediaByProduct, shops: [] };
  }

  const ops = ((opsRes.data as { value?: unknown } | null)?.value ?? {}) as Record<
    string,
    unknown
  >;
  const settings = sanitizeSettings(ops);
  // P1 #8 — wallet numbers the storefront may offer (sanitized to BD mobile;
  // ps_place_order re-checks against the same ops document at placement).
  const walletNum = (v: unknown): string | undefined => {
    let digits = typeof v === "string" ? v.replace(/\D/g, "") : "";
    if (digits.length > 11 && digits.startsWith("88")) digits = digits.slice(2);
    return /^01\d{9}$/.test(digits) ? digits : undefined;
  };
  const opsWallets = (ops.wallets ?? {}) as Record<string, unknown>;
  const codeRows = (codesRes.data ?? []) as {
    code: string;
    customer_id: string | null;
    customer_phone: string | null;
    customer_name: string | null;
  }[];
  type RewardRow = { code: string; referee_phone: string };
  const codeRewards = (codeRewardsRes.data ?? []) as RewardRow[];
  // Union of "rewards this code already paid" and "rewards this phone already
  // took", de-duplicated on the (code, phone) key the table is unique on.
  const rewardRows = [
    ...new Map(
      [...codeRewards, ...((phoneRewardsRes.data ?? []) as RewardRow[])].map((r) => [
        `${r.code}\u0000${r.referee_phone}`,
        r,
      ]),
    ).values(),
  ];
  const customerOrderCount = wantPhoneScope
    ? ((phoneOrdersRes.data ?? []) as { customer_phone: string }[]).filter(
        (r) => normalizePhone(r.customer_phone) === phoneDigits,
      ).length
    : undefined;
  return {
    promos: {
      flash: settings.flash,
      bundle: settings.bundle,
      gift: settings.gift,
      referral: settings.referral,
    },
    referralRecords: codeRows.map((row) => ({
      code: row.code,
      customerId: row.customer_id,
      referrerName: row.customer_name ?? "",
      referrerPhone: normalizePhone(row.customer_phone ?? ""),
      rewardsGranted: codeRewards.filter((r) => r.code === row.code).length,
      createdAt: 0,
    })),
    referralRewards: rewardRows.map((r) => ({
      code: r.code,
      refereePhone: r.referee_phone,
    })),
    ...(customerOrderCount !== undefined ? { customerOrderCount } : {}),
    products,
    payments: {
      bkash: walletNum(opsWallets.bkash),
      nagad: walletNum(opsWallets.nagad),
    },
    zones,
    coupons,
    variants,
    mediaByProduct,
    shops: ((shopsRes.data ?? []) as DbShop[]).map(mapShop),
    freeThresholdEnabled: ops.perZoneFreeThresholdEnabled !== false,
  };
}

const parseVariant = (label: string): { color: string; size: string } => {
  const [color = "", size = ""] = label.split("·").map((s) => s.trim());
  return { color, size };
};

/** Match a checkout variant label to its row for stock reservation. */
const resolveVariant = (
  variants: DbVariant[],
  productId: string,
  label: string,
): DbVariant | undefined => {
  const { color, size } = parseVariant(label);
  const pool = variants.filter((v) => v.product_id === productId);
  return (
    pool.find((v) => v.color === color && v.size === size) ??
    (color === "" && size === "" ? pool[0] : undefined) ??
    (pool.length === 1 ? pool[0] : undefined)
  );
};

export class OrderPlacementError extends Error {
  status: number;
  field: string;
  constructor(field: string, message: string, status = 422) {
    super(message);
    this.field = field;
    this.status = status;
  }
}

/**
 * Failures that are NOT the customer's doing — the database schema and the
 * installed `ps_place_order` disagree, so every order dies in the same way
 * regardless of what was typed. Each one names the file the owner has to run.
 *
 * Reproduced 2026-09-16 (see supabase/migrations/202609160002_order_insert_repair.sql):
 *  - 23502 on orders.gift_wrap — the column was NOT NULL while the RPC writes
 *    NULL for every non-gift order → no plain COD order could be stored.
 *  - P0001 "order total does not reconcile" / "only cash on delivery is
 *    enabled" — the phase-1 guard triggers never learned about tips, gift
 *    wrap or wallet payments, so those orders were refused.
 *  - 42703 / 42P01 — a column/table the installed RPC writes does not exist
 *    (a paste-part or a whole migration was skipped).
 */
const REPAIR_FILE = "supabase/migrations/202609160002_order_insert_repair.sql";
const isGuardTriggerRaise = (message: string): boolean =>
  /order total does not reconcile|only cash on delivery is enabled/i.test(message);

export const schemaGapFor = (error: {
  code?: string;
  message?: string;
}): string | null => {
  const code = error.code ?? "";
  const message = error.message ?? "";
  if (code === "PGRST202" || /function .*ps_place_order.* does not exist/i.test(message)) {
    return "ps_place_order is not installed — apply the checkout migrations (docs/go-live.md)";
  }
  if (code === "23502") {
    return `an orders column is still NOT NULL (${message.replace(/^null value in column /i, "").split(" of relation")[0]}) — run ${REPAIR_FILE}`;
  }
  if (code === "P0001" && isGuardTriggerRaise(message)) {
    return `the phase-1 order guard triggers are outdated ("${message.trim()}") — run ${REPAIR_FILE}`;
  }
  if (code === "42703" || code === "42P01") {
    return `the installed ps_place_order writes to something this database lacks (${message.trim()}) — run the missing migration (docs/go-live.md, supabase/diagnose.sql)`;
  }
  return null;
};

/** Map an RPC failure to a field-scoped, status-coded placement error (exported for tests). Our RPC raises user-safe messages (P0001); anything else is a 503. */
export const placementErrorFrom = (error: {
  code?: string;
  message?: string;
}): OrderPlacementError => {
  const message = error.message?.trim() || "";
  if (schemaGapFor(error) !== null) {
    // Not a validation problem: the shop's database needs a migration. Say
    // so honestly (no internals, no fake success) — the server log carries
    // the exact SQL error and the file to run.
    return new OrderPlacementError(
      "order",
      "Ordering is temporarily unavailable — the shop is finishing a database update. Please try again in a few minutes, or call the shop to order by phone.",
      503,
    );
  }
  if (error.code === "P0001" && message !== "") {
    const field = /coupon/i.test(message)
      ? "couponCode"
      : /zone/i.test(message)
        ? "zoneId"
        : /qty|quantity|product|variant|stock|left of|empty|shop/i.test(message)
          ? "items"
          : "order";
    return new OrderPlacementError(field, message, 422);
  }
  return new OrderPlacementError(
    "order",
    "Could not place the order — please try again.",
    503,
  );
};

export async function placeLiveOrder(
  draft: ValidOrderDraft,
  snapshot: OrderSnapshot,
): Promise<Order | null> {
  const db = getSupabaseService();
  if (!db) return null;

  const variantByLine = draft.items.map((it) =>
    resolveVariant(snapshot.variants, it.product.id, it.variantLabel),
  );
  const { data: orderId, error } = await db.rpc("ps_place_order", {
    p_order: {
      customer_name: draft.customer.name,
      customer_phone: draft.customer.phone,
      area: draft.customer.para || draft.customer.area,
      district: draft.customer.district,
      upazila: draft.customer.upazila,
      para: draft.customer.para,
      address: draft.customer.address,
      note: draft.customer.note,
      zone_id: draft.zone.id,
      lat: draft.geo?.lat ?? null,
      lng: draft.geo?.lng ?? null,
      distance_km: draft.geo?.distanceKm ?? null,
      scheduled_at: draft.scheduledAt ?? null,
      delivery_window: draft.deliveryWindow ?? null,
      is_express: draft.isExpress ?? false,
      is_pickup: draft.isPickup ?? false,
      pickup_slot: draft.pickupSlot ?? null,
      tip_amount: draft.tipAmount ?? 0,
      weight_kg: draft.weightKg ?? 0,
      surcharge_night: draft.surchargeNight ?? 0,
      surcharge_rain: draft.surchargeRain ?? 0,
      surcharge_distance: draft.surchargeDistance ?? 0,
      surcharge_express: draft.surchargeExpress ?? 0,
      surcharge_weight: draft.surchargeWeight ?? 0,
      coupon_code: draft.coupon?.code ?? null,
      // P0 intents only — ps_place_order turns them into money (it computes the
      // flash discount itself, bounds a bundle claim by the settings percentage,
      // prices the wrap fee from settings and proves the referral is a first
      // order before crediting anything).
      is_gift: draft.gift?.isGift ?? false,
      gift_wrap: draft.gift?.wrap ?? "none",
      gift_recipient_name: draft.gift?.recipientName ?? null,
      gift_recipient_phone: draft.gift?.recipientPhone ?? null,
      gift_message: draft.gift?.message ?? null,
      bundle_discount: draft.promo?.kind === "bundle" ? draft.promo.discount : 0,
      referral_code: draft.referral?.code ?? null,
      // P1 #8 — wallet payment intents: the RPC validates the method against
      // the ops wallets and requires a TRXID for bkash/nagad.
      payment_method: draft.paymentMethod ?? "cod",
      payment_ref: draft.paymentRef ?? null,
    },
    p_items: draft.items.map((it, i) => ({
      product_id: it.product.id,
      variant_id: variantByLine[i]?.id ?? null,
      variant_label: it.variantLabel,
      qty: it.qty,
    })),
  });
  if (error || !orderId) {
    const raw = (error ?? {}) as {
      code?: string;
      message?: string;
      details?: string;
      hint?: string;
    };
    // The customer only ever sees the mapped message; the log keeps the real
    // SQLSTATE so a "Could not place the order" report can be diagnosed from
    // Vercel → Logs without guessing.
    const gap = schemaGapFor(raw);
    console.error(
      "[orders] ps_place_order failed",
      JSON.stringify({
        code: raw.code ?? null,
        message: raw.message ?? (orderId ? null : "rpc returned no order id"),
        details: raw.details ?? null,
        hint: raw.hint ?? null,
        ...(gap ? { schemaGap: gap } : {}),
      }),
    );
    throw placementErrorFrom(raw);
  }
  // Read back the full bundle for the confirmation + tracking views.
  const placed = await findLiveOrderById(db, orderId as string, draft.customer.phone);
  if (!placed) {
    // The row exists (the RPC committed) but the read-back failed — say so in
    // the log rather than letting the route emit the generic 503 silently.
    console.error(
      "[orders] order placed but read-back failed",
      JSON.stringify({ orderId, phone: draft.customer.phone }),
    );
  }
  return placed;
}

/* ------------------------------------------------------------------ */
/* Order rows → domain (batched)                                       */
/* ------------------------------------------------------------------ */

/**
 * PostgREST `.in()` filters travel in the URL — keep each request well under
 * the gateway's limit (100 uuids ≈ 3.8 KB). Chunks run in parallel, so a
 * long list still costs ONE round trip of wall-clock time.
 */
const IN_CHUNK = 100;

const chunk = <T>(list: readonly T[]): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += IN_CHUNK) out.push(list.slice(i, i + IN_CHUNK));
  return out;
};

/**
 * Minimal shape of a PostgREST select builder — enough for the refinements
 * used here (`.eq`, `.order`) and to await. Typed loosely on purpose: the
 * supabase-js generics do not survive being passed through a helper.
 */
interface SelectBuilder extends PromiseLike<{ data: unknown; error: { message: string } | null }> {
  eq: (col: string, value: unknown) => SelectBuilder;
  order: (col: string, opts?: { ascending?: boolean }) => SelectBuilder;
}

/**
 * `select … where col in (ids)` across chunks. Returns the merged rows or
 * the first error; an empty id list never hits the network.
 */
const selectIn = async <Row>(
  db: SupabaseClient,
  table: string,
  columns: string,
  col: string,
  ids: readonly string[],
  refine: (q: SelectBuilder) => SelectBuilder = (q) => q,
): Promise<{ data: Row[]; error: { message: string } | null }> => {
  if (ids.length === 0) return { data: [], error: null };
  const results = await Promise.all(
    chunk(ids).map((part) =>
      refine(db.from(table).select(columns).in(col, part) as unknown as SelectBuilder),
    ),
  );
  const data: Row[] = [];
  for (const r of results) {
    if (r.error) return { data: [], error: r.error };
    data.push(...((r.data ?? []) as Row[]));
  }
  return { data, error: null };
};

const groupBy = <Row>(rows: readonly Row[], key: (row: Row) => string): Map<string, Row[]> => {
  const out = new Map<string, Row[]>();
  for (const row of rows) {
    const k = key(row);
    const list = out.get(k);
    if (list) list.push(row);
    else out.set(k, [row]);
  }
  return out;
};

const RIDER_VISIBLE_STATUSES = new Set(["courier-assigned", "out-for-delivery", "delivered"]);

/**
 * Full order bundles → domain Orders, for MANY rows at once. Works with the
 * service or a staff/vendor RLS client (the policies decide what is seen).
 *
 * Perf (audit 2026-09-17 P1.3): the per-order mapper cost 8–10 sequential
 * round trips, and the rider/dispatch/vendor lists called it once per order —
 * 100 orders ≈ 900 queries ≈ 40 s from Dhaka. This version fetches every
 * child table with `.in()` in TWO rounds (items/history/zones/coupons/
 * return links/assignments, then products/media/riders) whatever the count.
 *
 * Output is aligned with the input: `result[i]` is the Order for
 * `orders[i]`, or null when its items/history could not be read.
 */
export const toDomainMany = async (
  db: SupabaseClient,
  orders: readonly DbOrder[],
): Promise<(Order | null)[]> => {
  if (orders.length === 0) return [];
  const ids = orders.map((o) => o.id);
  const zoneIds = [...new Set(orders.map((o) => o.zone_id).filter(Boolean))];
  const couponIds = [
    ...new Set(orders.map((o) => o.coupon_id).filter((id): id is string => !!id)),
  ];
  // P1 #13: a delivered parent carries its linked return/exchange pickup.
  const parentCandidateIds = orders.filter((o) => !o.is_return).map((o) => o.id);
  // A return pickup shows the public number of the order it returns.
  const parentIds = [
    ...new Set(
      orders
        .filter((o) => o.is_return && o.return_parent_id)
        .map((o) => o.return_parent_id as string),
    ),
  ];
  // Slice 9 rider-leg: attach the assigned rider once dispatch has started.
  const dispatchedIds = orders
    .filter((o) => RIDER_VISIBLE_STATUSES.has(o.status))
    .map((o) => o.id);

  const [itemsRes, historyRes, zonesRes, couponsRes, childrenRes, parentsRes, assignmentsRes] =
    await Promise.all([
      selectIn<DbOrderItem>(db, "order_items", "*", "order_id", ids),
      selectIn<DbOrderHistory>(db, "order_status_history", "*", "order_id", ids, (q) =>
        q.order("created_at"),
      ),
      selectIn<{ id: string; name: string; eta_label: string }>(
        db,
        "delivery_zones",
        "id,name,eta_label",
        "id",
        zoneIds,
      ),
      selectIn<{ id: string; code: string }>(db, "coupons", "id,code", "id", couponIds),
      selectIn<{
        return_parent_id: string;
        order_no: string;
        status: string;
        return_status: string | null;
      }>(
        db,
        "orders",
        "return_parent_id,order_no,status,return_status",
        "return_parent_id",
        parentCandidateIds,
        (q) => q.order("created_at", { ascending: false }),
      ),
      selectIn<{ id: string; order_no: string }>(db, "orders", "id,order_no", "id", parentIds),
      selectIn<{ order_id: string; rider_id: string | null }>(
        db,
        "delivery_assignments",
        "order_id,rider_id",
        "order_id",
        dispatchedIds,
        (q) => q.order("offered_at", { ascending: false }),
      ),
    ]);
  if (itemsRes.error || historyRes.error) return orders.map(() => null);

  const itemsByOrder = groupBy(itemsRes.data, (it) => it.order_id);
  const historyByOrder = groupBy(historyRes.data, (h) => h.order_id);
  const zones = new Map(zonesRes.data.map((z) => [z.id, z]));
  const couponCodes = new Map(couponsRes.data.map((c) => [c.id, c.code]));
  // Rows arrive newest-first, so the first child/assignment per order wins —
  // the same "latest" the per-order `.limit(1)` used to pick.
  const latestChild = new Map<string, (typeof childrenRes.data)[number]>();
  for (const c of childrenRes.data) {
    if (!latestChild.has(c.return_parent_id)) latestChild.set(c.return_parent_id, c);
  }
  const parentNos = new Map(parentsRes.data.map((p) => [p.id, p.order_no]));
  const latestRiderByOrder = new Map<string, string>();
  for (const a of assignmentsRes.data) {
    if (!latestRiderByOrder.has(a.order_id) && a.rider_id) {
      latestRiderByOrder.set(a.order_id, a.rider_id);
    }
  }

  const productIds = [
    ...new Set(itemsRes.data.map((it) => it.product_id).filter((id): id is string => !!id)),
  ];
  const riderIds = [...new Set(latestRiderByOrder.values())];
  const [pRes, mRes, rRes] = await Promise.all([
    selectIn<{ id: string; slug: string; warranty_days: number | null }>(
      db,
      "products",
      "id,slug,warranty_days",
      "id",
      productIds,
    ),
    selectIn<{ product_id: string; url: string }>(
      db,
      "product_media",
      "product_id,url",
      "product_id",
      productIds,
      (q) => q.eq("type", "image").order("sort_order"),
    ),
    selectIn<{
      id: string;
      name: string;
      phone: string;
      rating_avg: number;
      rating_count: number;
    }>(db, "riders", "id,name,phone,rating_avg,rating_count", "id", riderIds),
  ]);
  const productRows = new Map(pRes.data.map((p) => [p.id, p]));
  const images = new Map<string, string>();
  for (const m of mRes.data) if (!images.has(m.product_id)) images.set(m.product_id, m.url);
  const products = new Map<string, { slug: string; image: string; warrantyDays?: number }>(
    productIds.map((id) => [
      id,
      {
        slug: productRows.get(id)?.slug ?? "",
        image: images.get(id) ?? "",
        warrantyDays: productRows.get(id)?.warranty_days ?? undefined,
      },
    ]),
  );
  const riders = new Map(rRes.data.map((r) => [r.id, r]));

  return orders.map((order) => {
    const zone = zones.get(order.zone_id);
    const domain = mapOrder({
      order,
      items: itemsByOrder.get(order.id) ?? [],
      history: historyByOrder.get(order.id) ?? [],
      zoneName: zone?.name ?? order.zone_id,
      etaLabel: zone?.eta_label ?? "",
      couponCode: order.coupon_id ? couponCodes.get(order.coupon_id) : undefined,
      products,
    });
    if (!domain) return null;
    if (order.delivery_code) domain.deliveryCode = order.delivery_code;

    if (!order.is_return) {
      const c = latestChild.get(order.id);
      if (c && c.return_status && c.return_status !== "rejected") {
        domain.returnChild = {
          orderNo: c.order_no,
          status: c.status as Order["status"],
          returnStatus: c.return_status,
        };
      }
    }
    if (order.is_return && order.return_parent_id) {
      const no = parentNos.get(order.return_parent_id);
      if (no) domain.returnParentOrderNo = no;
    }
    if (RIDER_VISIBLE_STATUSES.has(domain.status)) {
      const riderId = latestRiderByOrder.get(order.id);
      const r = riderId ? riders.get(riderId) : undefined;
      if (r) {
        domain.rider = {
          id: r.id,
          name: r.name,
          phone: r.phone,
          ratingAvg: r.rating_avg,
          ratingCount: r.rating_count,
        };
      }
    }
    return domain;
  });
};

/** One order row → domain Order (the batched mapper for a single row). */
export const toDomain = async (
  db: SupabaseClient,
  order: DbOrder,
): Promise<Order | null> => (await toDomainMany(db, [order]))[0] ?? null;

const findLiveOrderById = async (
  db: SupabaseClient,
  id: string,
  phone: string,
): Promise<Order | null> => {
  const { data, error } = await db.from("orders").select("*").eq("id", id).single();
  if (error || !data) return null;
  const order = data as DbOrder;
  if (normalizePhone(order.customer_phone) !== normalizePhone(phone)) return null;
  return toDomain(db, order);
};

/**
 * Guest tracking lookup: the order number is public-ish (printed on the
 * confirmation), the phone proves ownership. Null when unconfigured,
 * unknown, or the phone does not match — callers must not distinguish.
 */
export async function findLiveOrder(
  orderNo: string,
  phone: string,
): Promise<Order | null> {
  const db = getSupabaseService();
  if (!db) return null;
  const { data, error } = await db
    .from("orders")
    .select("*")
    .eq("order_no", orderNo.trim().toUpperCase())
    .single();
  if (error || !data) return null;
  const order = data as DbOrder;
  if (
    normalizePhone(order.customer_phone) === "" ||
    normalizePhone(order.customer_phone) !== normalizePhone(phone)
  ) {
    return null;
  }
  return toDomain(db, order);
}
