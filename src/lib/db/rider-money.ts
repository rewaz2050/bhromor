/**
 * Rider money Phase 2 (2026-09-30) — docs/AUDIT-RIDER-MONEY-2026-09-30.md.
 *
 *   C. Per-delivery earnings — the rates live in `site_settings` and are read
 *      by the deliver RPC itself (`ps_setting_int`); this module owns the TS
 *      side of the same three keys, so Admin → Money is the single editor.
 *   D. Rider payouts — request (rider), approve/reject (staff).
 *   M. Admin money dashboard — one RPC, derived from the ledgers.
 *   N. The rider's own earnings page — statement header + journal feed.
 *
 * Degradation: every function here tolerates a database where 202609300002
 * has not been applied yet (a missing RPC/table is a `null` / empty answer,
 * never a crash) so the rider app and the admin dashboard keep working
 * before the owner runs the migration.
 */

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { isMissingDbObject, RiderInputError } from "./riders";
import { AdminInputError } from "./admin";
import type { DbRiderEarning, DbRiderPayoutRequest } from "./types";
import type { MoneyPnl } from "@/lib/money-pnl";

/* ------------------------------------------------------------------ */
/* C — per-delivery pay rates (site_settings, flat keys like           */
/*     `free_delivery_threshold_paisa` so SQL can read them directly)  */
/* ------------------------------------------------------------------ */

export const RIDER_PAY_KEYS = {
  baseFee: "rider_base_fee_paisa",
  codHandlingFee: "rider_cod_handling_fee_paisa",
  minPayout: "rider_min_payout_paisa",
} as const;

export interface RiderPaySettings {
  /** Paid to the rider for every completed delivery (paisa). */
  baseFee: number;
  /** Extra for a COD delivery — collecting cash is work (paisa). */
  codHandlingFee: number;
  /** A withdrawal request below this is refused (paisa). */
  minPayout: number;
}

/**
 * 0 = "not configured yet". Deliberately the default: crediting an invented
 * per-delivery rate into riders' wallets is a money decision for the owner,
 * so the system starts at zero and the dashboard says so out loud.
 */
export const RIDER_PAY_DEFAULTS: RiderPaySettings = {
  baseFee: 0,
  codHandlingFee: 0,
  minPayout: 0,
};

/** Caps stop a typo from crediting ৳10,000 per delivery. */
const BASE_FEE_CAP = 100_000; // ৳1,000
const COD_FEE_CAP = 50_000; // ৳500
const MIN_PAYOUT_CAP = 5_000_000; // ৳50,000

/** Paisa amount: integer ≥ 0, capped. `null` when the input is unusable. */
const readPaisa = (raw: unknown, cap: number): number | null => {
  const value =
    typeof raw === "number"
      ? raw
      : typeof raw === "string" && raw.trim() !== ""
        ? Number(raw)
        : Number.NaN;
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.min(cap, Math.floor(value));
};

/**
 * Strict read for writes: every key must be a sane non-negative amount, or
 * the save is refused with a field-naming message (never a silent 0, which
 * would wipe a configured rate).
 */
export const parseRiderPaySettings = (
  raw: unknown,
): { settings: RiderPaySettings; error?: string } => {
  const p = (raw ?? {}) as Record<string, unknown>;
  const baseFee = readPaisa(p.baseFee, BASE_FEE_CAP);
  const codHandlingFee = readPaisa(p.codHandlingFee, COD_FEE_CAP);
  const minPayout = readPaisa(p.minPayout, MIN_PAYOUT_CAP);
  if (baseFee === null) return { settings: RIDER_PAY_DEFAULTS, error: "Per-delivery fee (৳) is not a valid amount." };
  if (codHandlingFee === null) return { settings: RIDER_PAY_DEFAULTS, error: "COD handling fee (৳) is not a valid amount." };
  if (minPayout === null) return { settings: RIDER_PAY_DEFAULTS, error: "Minimum payout (৳) is not a valid amount." };
  return { settings: { baseFee, codHandlingFee, minPayout } };
};

/** Lenient read for the UI: anything unusable falls back to its default. */
export const sanitizeRiderPaySettings = (raw: unknown): RiderPaySettings => {
  const { settings } = parseRiderPaySettings(raw);
  return settings;
};

const settingsFromRows = (rows: { key: string; value: unknown }[]): RiderPaySettings => {
  const raw: Record<string, unknown> = {};
  for (const row of rows) {
    const value = typeof row.value === "string" ? row.value : row.value;
    if (row.key === RIDER_PAY_KEYS.baseFee) raw.baseFee = value;
    if (row.key === RIDER_PAY_KEYS.codHandlingFee) raw.codHandlingFee = value;
    if (row.key === RIDER_PAY_KEYS.minPayout) raw.minPayout = value;
  }
  return sanitizeRiderPaySettings(raw);
};

export const readRiderPaySettings = async (
  db: SupabaseClient,
): Promise<RiderPaySettings> => {
  const { data, error } = await db
    .from("site_settings")
    .select("key,value")
    .in("key", Object.values(RIDER_PAY_KEYS));
  if (error || !data) return RIDER_PAY_DEFAULTS;
  return settingsFromRows(data as { key: string; value: unknown }[]);
};

export const writeRiderPaySettings = async (
  db: SupabaseClient,
  raw: unknown,
): Promise<RiderPaySettings> => {
  const { settings, error } = parseRiderPaySettings(raw);
  if (error) throw new AdminInputError(error, 422);
  const rows = Object.entries(RIDER_PAY_KEYS).map(([field, key]) => ({
    key,
    value: settings[field as keyof RiderPaySettings],
  }));
  const { error: writeError } = await db
    .from("site_settings")
    .upsert(rows, { onConflict: "key" });
  if (writeError) throw new Error("Could not save the rider pay rates.");
  return settings;
};

/* ------------------------------------------------------------------ */
/* N — rider statement                                                 */
/* ------------------------------------------------------------------ */

export interface RiderMoneySummary {
  /** Wallet owed by the platform (tips + fees − held payouts). */
  balance: number;
  /** COD cash in the rider's hands — a liability, not income. */
  cashInHand: number;
  today: number;
  week: number;
  lifetime: number;
  tips: number;
  deliveryFees: number;
  codHandling: number;
  incentives: number;
  paidOut: number;
  pendingPayout: number;
  deliveriesToday: number;
  baseFee: number;
  codHandlingFee: number;
  minPayout: number;
}

export interface RiderMoneyEntry {
  id: string;
  kind: DbRiderEarning["kind"];
  amount: number;
  note: string;
  at: number;
  /** PUBLIC order number (PS-…) when the movement belongs to a delivery. */
  orderId?: string;
  payoutId?: string;
}

export interface RiderPayout {
  id: string;
  amount: number;
  method: string;
  account: string;
  status: DbRiderPayoutRequest["status"];
  requestedAt: number;
  decidedAt?: number;
  note?: string;
  reference: string;
}

const num = (value: unknown): number => {
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
};

const epoch = (iso: string | null | undefined): number => {
  const ms = Date.parse(iso ?? "");
  return Number.isFinite(ms) ? ms : 0;
};

/**
 * The rider's statement header (one RPC). MUST run on the rider's own
 * RLS-bound (JWT) client: the RPC resolves the rider through `auth.uid()`
 * (`ps_rider_id()`), which is NULL on the service-role client → "forbidden".
 * `null` on a database where
 * 202609300002 has not run — the page then shows the pending-migration card
 * instead of a wall of zeros that look like real numbers.
 */
export const getRiderMoneySummary = async (
  riderDb: SupabaseClient,
): Promise<RiderMoneySummary | null> => {
  const { data, error } = await riderDb.rpc("ps_rider_money_summary");
  if (error) {
    if (isMissingDbObject(error)) return null;
    throw new Error(error.message);
  }
  const raw = (data ?? {}) as Record<string, unknown>;
  return {
    balance: num(raw.balance),
    cashInHand: num(raw.cashInHand),
    today: num(raw.today),
    week: num(raw.week),
    lifetime: num(raw.lifetime),
    tips: num(raw.tips),
    deliveryFees: num(raw.deliveryFees),
    codHandling: num(raw.codHandling),
    incentives: num(raw.incentives),
    paidOut: num(raw.paidOut),
    pendingPayout: num(raw.pendingPayout),
    deliveriesToday: num(raw.deliveriesToday),
    baseFee: num(raw.baseFee),
    codHandlingFee: num(raw.codHandlingFee),
    minPayout: num(raw.minPayout),
  };
};

/**
 * The rider's journal feed. Order-bound rows carry the PUBLIC order number
 * (the uuid never leaves the database); payouts carry the request id.
 */
export const listRiderMoneyEntries = async (
  service: SupabaseClient,
  riderId: string,
  limit = 40,
): Promise<RiderMoneyEntry[]> => {
  const { data, error } = await service
    .from("rider_earnings")
    .select("id,order_id,kind,amount,payout_id,note,created_at")
    .eq("rider_id", riderId)
    .order("created_at", { ascending: false })
    .limit(Math.max(1, Math.min(100, limit)));
  if (error) {
    if (isMissingDbObject(error)) return [];
    throw new Error("rider earnings read failed");
  }
  const rows = (data ?? []) as DbRiderEarning[];
  const orderRowIds = [
    ...new Set(rows.flatMap((r) => (r.order_id ? [r.order_id] : []))),
  ];
  const orderNos = new Map<string, string>();
  if (orderRowIds.length > 0) {
    const { data: orders } = await service
      .from("orders")
      .select("id,order_no")
      .in("id", orderRowIds);
    for (const row of (orders ?? []) as { id: string; order_no: string | null }[]) {
      if (row.order_no) orderNos.set(row.id, row.order_no);
    }
  }
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    amount: num(row.amount),
    note: row.note ?? "",
    at: epoch(row.created_at),
    orderId: row.order_id ? orderNos.get(row.order_id) : undefined,
    payoutId: row.payout_id ?? undefined,
  }));
};

export const listRiderPayouts = async (
  service: SupabaseClient,
  riderId: string,
  limit = 25,
): Promise<RiderPayout[]> => {
  const { data, error } = await service
    .from("rider_payout_requests")
    .select("*")
    .eq("rider_id", riderId)
    .order("requested_at", { ascending: false })
    .limit(Math.max(1, Math.min(100, limit)));
  if (error) {
    if (isMissingDbObject(error)) return [];
    throw new Error("rider payouts read failed");
  }
  return ((data ?? []) as DbRiderPayoutRequest[]).map(mapPayout);
};

const mapPayout = (row: DbRiderPayoutRequest): RiderPayout => ({
  id: row.id,
  amount: num(row.amount),
  method: row.method,
  account: row.account,
  status: row.status,
  requestedAt: epoch(row.requested_at),
  decidedAt: row.decided_at ? epoch(row.decided_at) : undefined,
  note: row.note ?? undefined,
  reference: row.reference ?? "",
});

/**
 * File a withdrawal. The database holds the money immediately, so every
 * refusal below is an honest, rider-readable sentence — never a raw
 * "insufficient earnings balance" from Postgres.
 */
export const requestRiderPayout = async (
  db: SupabaseClient,
  input: { amount: number; method: string; account: string },
): Promise<RiderPayout> => {
  const { data, error } = await db.rpc("ps_rider_request_payout", {
    p_amount: input.amount,
    p_method: input.method,
    p_account: input.account,
  });
  if (error) {
    const message = (error.message ?? "").toLowerCase();
    if (isMissingDbObject(error)) {
      throw new RiderInputError(
        "উত্তোলনের সুবিধা এখনো চালু হয়নি — ব্যাকএন্ড আপডেট (migration 202609300002) বাকি আছে। অ্যাডমিনকে জানান।",
        503,
      );
    }
    if (message.includes("already pending")) {
      throw new RiderInputError("আপনার একটি উত্তোলনের অনুরোধ ইতিমধ্যে অপেক্ষায় আছে — সেটি নিষ্পত্তি হলে আবার চেষ্টা করুন।", 409);
    }
    if (message.includes("insufficient")) {
      throw new RiderInputError("আপনার আয়ের ব্যালেন্সে এত টাকা নেই।", 422);
    }
    if (message.includes("below minimum")) {
      throw new RiderInputError("সর্বনিম্ন উত্তোলনের পরিমাণের চেয়ে কম — একটু বেশি টাকা দিন।", 422);
    }
    if (message.includes("account number required")) {
      throw new RiderInputError("bKash/Nagad/ব্যাংক নম্বর দিন।", 422);
    }
    if (message.includes("rider not active")) {
      throw new RiderInputError("আপনার অ্যাকাউন্ট এখন সক্রিয় নয় — অ্যাডমিনের সাথে যোগাযোগ করুন।", 403);
    }
    throw new RiderInputError("উত্তোলনের অনুরোধ নেওয়া যায়নি — আবার চেষ্টা করুন।", 422);
  }
  return mapPayout(data as DbRiderPayoutRequest);
};

/* ------------------------------------------------------------------ */
/* M — admin money dashboard + payout queue                            */
/* ------------------------------------------------------------------ */

export interface AdminMoneySummary {
  commissionIncome: number;
  deliveryIncome: number;
  tipsCollected: number;
  tipsToRiders: number;
  riderFeesEarned: number;
  deliveredOrders: number;
  riderPayable: number;
  riderPayoutsPending: number;
  riderPayoutsPendingCount: number;
  riderPayoutsPaid: number;
  shopPayable: number;
  codCustody: number;
  codClaimsPending: number;
  activeRiders: number;
  onlineRiders: number;
  baseFee: number;
  codHandlingFee: number;
  minPayout: number;
}

/**
 * Platform money position. MUST run on the STAFF's own JWT client:
 * `ps_is_admin()` reads `auth.uid()`, which is NULL on the service-role
 * client, so the RPC would answer "forbidden" for every caller.
 */
export const getAdminMoneySummary = async (
  staffDb: SupabaseClient,
): Promise<AdminMoneySummary | null> => {
  const { data, error } = await staffDb.rpc("ps_admin_money_summary");
  if (error) {
    if (isMissingDbObject(error)) return null;
    throw new Error(error.message);
  }
  const raw = (data ?? {}) as Record<string, unknown>;
  const keys: (keyof AdminMoneySummary)[] = [
    "commissionIncome",
    "deliveryIncome",
    "tipsCollected",
    "tipsToRiders",
    "riderFeesEarned",
    "deliveredOrders",
    "riderPayable",
    "riderPayoutsPending",
    "riderPayoutsPendingCount",
    "riderPayoutsPaid",
    "shopPayable",
    "codCustody",
    "codClaimsPending",
    "activeRiders",
    "onlineRiders",
    "baseFee",
    "codHandlingFee",
    "minPayout",
  ];
  return Object.fromEntries(keys.map((key) => [key, num(raw[key])])) as unknown as AdminMoneySummary;
};

export interface RiderPayoutQueueRow extends RiderPayout {
  riderId: string;
  riderName: string;
  riderPhone: string;
  /** The rider's CURRENT wallet balance + the cash they still hold. */
  earningsBalance: number;
  cashInHand: number;
}

export interface RiderPayoutQueue {
  pending: RiderPayoutQueueRow[];
  /** Recently decided requests, newest first — context for the queue. */
  decided: RiderPayoutQueueRow[];
}

const queueRows = async (
  service: SupabaseClient,
  rows: DbRiderPayoutRequest[],
): Promise<RiderPayoutQueueRow[]> => {
  if (rows.length === 0) return [];
  const riderIds = [...new Set(rows.map((r) => r.rider_id))];
  const { data: riderRows } = await service
    .from("riders")
    .select("id,name,phone,earnings_balance,cash_in_hand")
    .in("id", riderIds);
  const riders = new Map(
    (
      (riderRows ?? []) as {
        id: string;
        name: string;
        phone: string;
        earnings_balance: number | string | null;
        cash_in_hand: number | string | null;
      }[]
    ).map((r) => [r.id, r] as const),
  );
  return rows.map((row) => {
    const rider = riders.get(row.rider_id);
    return {
      ...mapPayout(row),
      riderId: row.rider_id,
      riderName: rider?.name ?? "Rider",
      riderPhone: rider?.phone ?? "",
      earningsBalance: num(rider?.earnings_balance),
      cashInHand: num(rider?.cash_in_hand),
    };
  });
};

/**
 * The staff payout queue. Pending first (oldest first — it is a queue), then
 * the last decisions. `null` when the migration has not run yet.
 */
export const listRiderPayoutQueue = async (
  service: SupabaseClient,
): Promise<RiderPayoutQueue | null> => {
  const [pendingResult, decidedResult] = await Promise.all([
    service
      .from("rider_payout_requests")
      .select("*")
      .eq("status", "pending")
      .order("requested_at", { ascending: true })
      .limit(100),
    service
      .from("rider_payout_requests")
      .select("*")
      .neq("status", "pending")
      .order("decided_at", { ascending: false })
      .limit(10),
  ]);
  if (pendingResult.error) {
    if (isMissingDbObject(pendingResult.error)) return null;
    throw new Error("rider payout queue read failed");
  }
  const [pending, decided] = await Promise.all([
    queueRows(service, (pendingResult.data ?? []) as DbRiderPayoutRequest[]),
    queueRows(service, (decidedResult.data ?? []) as DbRiderPayoutRequest[]),
  ]);
  return { pending, decided };
};

/**
 * Staff decision on a payout request: `paid` (money left the office) or
 * `rejected` (the held amount goes back to the rider's wallet).
 *
 * `staffDb` (the staff member's JWT client) runs the RPC — its
 * `ps_is_admin()` gate needs a real `auth.uid()`. `service` is only used for
 * the display-only decided_by_email stamp on a table with no RLS policies.
 */
export const decideRiderPayout = async (
  staffDb: SupabaseClient,
  service: SupabaseClient,
  user: { id: string; email?: string | null },
  input: {
    payoutId: string;
    decision: "paid" | "rejected";
    note?: string;
    reference?: string;
  },
): Promise<RiderPayout> => {
  const { data, error } = await staffDb.rpc("ps_admin_decide_rider_payout", {
    p_payout_id: input.payoutId,
    p_decision: input.decision,
    p_note: input.note?.trim() ? input.note.trim().slice(0, 300) : null,
    p_reference: (input.reference ?? "").trim().slice(0, 120),
  });
  if (error) {
    const message = (error.message ?? "").toLowerCase();
    if (message.includes("forbidden")) throw new AdminInputError("Not allowed.", 403);
    if (message.includes("not found")) throw new AdminInputError("That payout request no longer exists.", 404);
    if (message.includes("already")) {
      throw new AdminInputError("Someone already decided this request — the queue is refreshing.", 409);
    }
    if (isMissingDbObject(error)) {
      throw new AdminInputError(
        "Payout backend not installed yet — run supabase/migrations/202609300002_rider_money.sql.",
        503,
      );
    }
    throw new AdminInputError("Could not record the payout decision.", 422);
  }
  const row = data as DbRiderPayoutRequest & { decided_by_email?: string | null };
  // Record who decided, for the audit trail (best-effort: the RPC already
  // stores decided_by; the e-mail is display sugar).
  if (row?.id && user.email) {
    await service
      .from("rider_payout_requests")
      .update({ decided_by_email: user.email.slice(0, 160) })
      .eq("id", row.id);
  }
  return mapPayout(row);
};

/**
 * Net P&L for a window (202610010003). Staff JWT client, same reason as the
 * summary. null = the migration has not run (the page then says so).
 */
export const getAdminMoneyPnl = async (
  staffDb: SupabaseClient,
  window: { from: string | null; to: string | null },
): Promise<MoneyPnl | null> => {
  const { data, error } = await staffDb.rpc("ps_admin_money_pnl", {
    p_from: window.from,
    p_to: window.to,
  });
  if (error) {
    if (isMissingDbObject(error)) return null;
    throw new Error(error.message);
  }
  const raw = (data ?? {}) as Record<string, unknown>;
  const keys: (keyof MoneyPnl)[] = [
    "deliveredOrders",
    "returnLegs",
    "commission",
    "deliveryIncome",
    "shopFundedFreeDelivery",
    "riderFees",
    "riderAdjustments",
    "discountsGiven",
    "shopFundedDiscounts",
    "tipsCollected",
    "tipsToRiders",
  ];
  return Object.fromEntries(keys.map((k) => [k, num(raw[k])])) as unknown as MoneyPnl;
};
