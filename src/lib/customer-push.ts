/**
 * Customer (shopper) Web Push — the fan-out this shop never had.
 *
 * Until 2026-09-24 a shopper learned nothing until *they* opened `/track` or
 * the shop called them: an order could be confirmed, packed and delivered
 * without a single automatic message reaching the phone that placed it. This
 * module closes exactly that gap, on the channel the stack already has
 * (VAPID Web Push, no SMS gateway, no email provider, no cost per message).
 *
 * Design decisions worth knowing before editing:
 *
 *   • **Bound to the checkout phone, not an account.** This store's identity
 *     for a shopper is the number on the order (guests order too). A device
 *     registers from `/track` after proving it knows the order number *and*
 *     that number's phone — the same proof the tracker already demands.
 *
 *   • **Milestones only.** `statusToEventKind()` maps the eight internal
 *     states onto four promises a shopper can check. `preparing` and
 *     `ready-for-pickup` deliberately map to nothing: three useful pushes
 *     beat eight notifications.
 *
 *   • **Never throws, never stalls.** Every entry point is best-effort and
 *     capped at ~2.5 s (same rule as the staff fan-out): a sleepy push
 *     service must not hold up a checkout, a rider's Delivered, or an admin
 *     Confirm. The row in `orders` and the tracker stay the source of truth.
 *
 *   • **Dead endpoints are pruned** (404/410) so the table does not grow a
 *     graveyard of reinstalled browsers.
 */

import "server-only";
import webpush from "web-push";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { OrderStatus } from "@/lib/orders";
import type { Language } from "@/lib/translations";
import {
  customerProductMessage,
  customerPushMessage,
  statusToEventKind,
  type CustomerEventKind,
  type ProductEventKind,
} from "@/lib/notify-messages";

/** Same VAPID pair the staff devices use — one key for the whole site. */
const nonEmpty = (value: string | undefined | null, max = 500): string | null => {
  const trimmed = value?.trim() ?? "";
  return trimmed === "" ? null : trimmed.slice(0, max);
};

const vapidSubject = (): string =>
  nonEmpty(process.env.PUSH_VAPID_SUBJECT) ?? "mailto:ops@prosanti.example";

export const isCustomerPushConfigured = (): boolean =>
  nonEmpty(process.env.PUSH_VAPID_PUBLIC_KEY) !== null &&
  nonEmpty(process.env.PUSH_VAPID_PRIVATE_KEY) !== null;

/** The public key the shopper's browser needs (null while unconfigured). */
export const customerVapidKey = (): string | null =>
  nonEmpty(process.env.PUSH_VAPID_PUBLIC_KEY);

let configuredOnce: boolean | null = null;
const ensureVapid = (): boolean => {
  if (configuredOnce !== null) return configuredOnce;
  if (!isCustomerPushConfigured()) {
    configuredOnce = false;
    return false;
  }
  try {
    webpush.setVapidDetails(
      vapidSubject(),
      nonEmpty(process.env.PUSH_VAPID_PUBLIC_KEY) ?? "",
      nonEmpty(process.env.PUSH_VAPID_PRIVATE_KEY) ?? "",
    );
    configuredOnce = true;
  } catch {
    configuredOnce = false;
  }
  return configuredOnce;
};

const clean = (value: unknown, max: number): string =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

/* ------------------------------------------------------------------ */
/* Subscriptions                                                       */
/* ------------------------------------------------------------------ */

export interface CustomerSubscription {
  endpoint: string;
  p256dh: string;
  auth: string;
  phone: string;
  lang: Language;
}

export type CustomerPushSaveFailure = "invalid" | "missing_table" | "error";
export type CustomerPushSaveResult =
  | { ok: true }
  | { ok: false; reason: CustomerPushSaveFailure };

/**
 * The `customer_push_subscriptions` table is service-role only, so a missing
 * table (migration 202609240001 not pasted) must be told apart from a bad
 * request — same reasoning as the staff table's `pushSaveFailureReason`.
 */
export const customerPushSaveFailureReason = (
  error: { code?: string; message?: string } | null | undefined,
): CustomerPushSaveFailure | null => {
  if (!error) return null;
  const code = typeof error.code === "string" ? error.code : "";
  const message = typeof error.message === "string" ? error.message.toLowerCase() : "";
  if (
    code === "42P01" ||
    code === "PGRST205" ||
    message.includes("does not exist") ||
    message.includes("could not find the table") ||
    message.includes("schema cache")
  ) {
    return "missing_table";
  }
  return "error";
};

/** Upsert one device against a phone number (re-subscribing refreshes it). */
export const saveCustomerPushSubscription = async (
  db: SupabaseClient,
  sub: {
    endpoint: unknown;
    keys?: { p256dh?: unknown; auth?: unknown };
    phone: unknown;
    lang?: unknown;
  },
): Promise<CustomerPushSaveResult> => {
  const endpoint = clean(sub.endpoint, 500);
  const p256dh = clean(sub.keys?.p256dh, 200);
  const auth = clean(sub.keys?.auth, 200);
  const phone = clean(sub.phone, 20);
  const lang: Language = sub.lang === "en" ? "en" : "bn";
  if (!endpoint.startsWith("https://") || p256dh === "" || auth === "" || phone === "") {
    return { ok: false, reason: "invalid" };
  }
  const { error } = await db.from("customer_push_subscriptions").upsert(
    { endpoint, p256dh, auth, phone, lang, last_seen_at: new Date().toISOString() },
    { onConflict: "endpoint" },
  );
  const reason = customerPushSaveFailureReason(error);
  return reason ? { ok: false, reason } : { ok: true };
};

export const removeCustomerPushSubscription = async (
  db: SupabaseClient,
  endpoint: unknown,
): Promise<void> => {
  const cleanEndpoint = clean(endpoint, 500);
  if (!cleanEndpoint) return;
  await db.from("customer_push_subscriptions").delete().eq("endpoint", cleanEndpoint);
};

const listForPhone = async (
  db: SupabaseClient,
  phone: string,
): Promise<CustomerSubscription[]> => {
  const { data } = await db
    .from("customer_push_subscriptions")
    .select("endpoint, p256dh, auth, phone, lang")
    .eq("phone", phone)
    .limit(20);
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    endpoint: clean(row.endpoint, 500),
    p256dh: clean(row.p256dh, 200),
    auth: clean(row.auth, 200),
    phone: clean(row.phone, 20),
    lang: row.lang === "en" ? "en" : "bn",
  }));
};

/**
 * Just the phones that have at least one device registered — the cheap
 * "is this shopper reachable at all?" question the scheduler asks before it
 * spends a one-shot mark (a reminder nobody could receive should stay unspent
 * so a shopper who opts in later in the window still gets it).
 */
export const subscribedPhones = async (
  db: SupabaseClient,
  phones: readonly string[],
): Promise<Set<string>> => {
  const wanted = [
    ...new Set(phones.map((p) => clean(p, 20)).filter((p) => p !== "")),
  ].slice(0, 200);
  if (wanted.length === 0) return new Set();
  const { data, error } = await db
    .from("customer_push_subscriptions")
    .select("phone")
    .in("phone", wanted);
  if (error) return new Set();
  return new Set(
    ((data ?? []) as { phone?: unknown }[]).map((row) => clean(row.phone, 20)),
  );
};

/** True when the table is there (used by /api/health and the opt-in card). */
export const customerPushReady = async (
  db: SupabaseClient,
): Promise<{ ready: boolean; count: number }> => {
  const { count, error } = await db
    .from("customer_push_subscriptions")
    .select("endpoint", { count: "exact", head: true });
  return {
    ready: customerPushSaveFailureReason(error) !== "missing_table",
    count: count ?? 0,
  };
};

/* ------------------------------------------------------------------ */
/* Fan-out                                                             */
/* ------------------------------------------------------------------ */

/**
 * Send one payload per registered device, in parallel, under a hard cap.
 *
 * Returns how many devices the push service accepted (0 when every device is
 * dead) — the callers ignore it, but it makes the behaviour testable and lets
 * a future "why did nobody get it" question be answered from a log line.
 * 404/410 = the browser is gone (reinstall, cleared data) → prune the row.
 */
const sendFanOut = async (
  db: SupabaseClient,
  subs: readonly CustomerSubscription[],
  build: (lang: Language) => string,
  capMs = 2_500,
): Promise<number> => {
  if (subs.length === 0) return 0;
  const payloads = new Map<Language, string>();
  const payloadFor = (lang: Language): string => {
    const cached = payloads.get(lang);
    if (cached) return cached;
    const built = build(lang);
    payloads.set(lang, built);
    return built;
  };

  const settled = Promise.allSettled(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payloadFor(sub.lang),
          { TTL: 3600 },
        );
        return "ok";
      } catch (err) {
        const status =
          typeof err === "object" && err !== null && "statusCode" in err
            ? Number((err as { statusCode?: unknown }).statusCode)
            : 0;
        if (status === 404 || status === 410) {
          await removeCustomerPushSubscription(db, sub.endpoint);
        }
        return "failed";
      }
    }),
  );

  // Race against the cap — a shopper's push must never delay a status write.
  const timeout = new Promise<"timeout">((resolve) =>
    setTimeout(() => resolve("timeout"), capMs),
  );
  const results = (await Promise.race([settled, timeout])) as
    | PromiseSettledResult<string>[]
    | "timeout";
  if (results === "timeout") return 0;
  return results.filter((r) => r.status === "fulfilled" && r.value === "ok").length;
};

/**
 * The fan-out core: one message, every device this phone registered.
 * Everything in this module is built on it — order milestones, the scheduled
 * reminder, and the price/restock watches below.
 */
export const pushCustomerMessage = async (
  db: SupabaseClient,
  input: {
    /** Normalised BD mobile (the order's `customer_phone`, or a watch row's). */
    phone: string | null | undefined;
    /** Called once per language in play — build the payload for that device. */
    build: (lang: Language) => { title: string; body: string; href: string };
    /** Pre-loaded devices (the batched watch fan-out passes its own). */
    subs?: readonly CustomerSubscription[];
  },
): Promise<number> => {
  try {
    const phone = clean(input.phone, 20);
    if (!phone) return 0;
    if (!ensureVapid()) return 0;
    const subs = input.subs ?? (await listForPhone(db, phone));
    if (subs.length === 0) return 0;
    return await sendFanOut(db, subs, (lang) => JSON.stringify(input.build(lang)));
  } catch {
    // Push is a courtesy; the tracker and the phone call are the guarantees.
    return 0;
  }
};

/** Every device a shopper registered on this phone (the fan-out's own read). */
export const customerDevicesForPhone = async (
  db: SupabaseClient,
  phone: string | null | undefined,
): Promise<CustomerSubscription[]> => {
  const cleanPhone = clean(phone, 20);
  if (!cleanPhone) return [];
  try {
    return await listForPhone(db, cleanPhone);
  } catch {
    return [];
  }
};

/**
 * Push one order event to every device the shopper registered on this phone.
 *
 * Returns how many devices the push service accepted (0 when the shopper
 * never opted in, when VAPID keys are missing, or when every device is dead).
 */
export const pushOrderMilestone = async (
  db: SupabaseClient,
  input: {
    /** Normalised BD mobile (the order's `customer_phone`). */
    phone: string | null | undefined;
    orderNo: string;
    status?: OrderStatus | null;
    /** Explicit event (payment verified has no status of its own). */
    kind?: CustomerEventKind;
    total?: number | null;
    /** The promised delivery window, for the scheduler's reminder. */
    when?: string | null;
  },
): Promise<number> => {
  const orderNo = clean(input.orderNo, 40);
  const kind = input.kind ?? (input.status ? statusToEventKind(input.status) : null);
  if (!orderNo || !kind) return 0;
  return pushCustomerMessage(db, {
    phone: input.phone,
    build: (lang) =>
      customerPushMessage({
        kind,
        orderNo,
        phone: input.phone,
        total: input.total ?? null,
        when: input.when ?? null,
        lang,
      }),
  });
};

/**
 * A price drop or a restock, pushed to every watch row's phone at once.
 *
 * One batched read for all the numbers (`in` on the phone column) and one
 * 2.5 s cap for the whole set: a shop reopening a sold-out bestseller may have
 * a hundred watchers, and the product save that triggered this must not wait
 * for any of them. `reached` is the part staff must not call — the caller
 * keeps only the phone numbers that got no push in the inbox note.
 */
export const pushProductEvent = async (
  db: SupabaseClient,
  input: {
    phones: readonly string[];
    kind: ProductEventKind;
    productName: string;
    pricePaisa?: number | null;
    /** `/product/<slug>` — see `customerProductMessage`. */
    href?: string | null;
    capMs?: number;
  },
): Promise<{ accepted: number; devices: number; reached: string[] }> => {
  const phones = [
    ...new Set(input.phones.map((p) => clean(p, 20)).filter((p) => p !== "")),
  ].slice(0, 200);
  const empty = { accepted: 0, devices: 0, reached: [] as string[] };
  if (phones.length === 0) return empty;
  try {
    if (!ensureVapid()) return empty;
    const { data, error } = await db
      .from("customer_push_subscriptions")
      .select("endpoint, p256dh, auth, phone, lang")
      .in("phone", phones)
      .limit(300);
    if (error) return empty;
    const subs = ((data ?? []) as Record<string, unknown>[]).map((row) => ({
      endpoint: clean(row.endpoint, 500),
      p256dh: clean(row.p256dh, 200),
      auth: clean(row.auth, 200),
      phone: clean(row.phone, 20),
      lang: row.lang === "en" ? ("en" as const) : ("bn" as const),
    }));
    const accepted = await sendFanOut(
      db,
      subs,
      (lang) =>
        JSON.stringify(
          customerProductMessage({
            kind: input.kind,
            productName: input.productName,
            pricePaisa: input.pricePaisa ?? null,
            href: input.href ?? null,
            lang,
          }),
        ),
      input.capMs ?? 2_500,
    );
    // Which numbers actually heard it — the devices that failed (or the
    // phones with no device at all) stay on the staff call list.
    const reached = accepted > 0 ? [...new Set(subs.map((s) => s.phone))] : [];
    return { accepted, devices: subs.length, reached };
  } catch {
    return empty;
  }
};

/**
 * Status-change helper for the three write paths (staff advance, vendor
 * advance, rider pickup/deliver). Silently does nothing for the states a
 * shopper should not be told about — see `statusToEventKind`.
 */
export const notifyCustomerOfStatus = async (
  db: SupabaseClient,
  input: {
    phone: string | null | undefined;
    orderNo: string;
    status: OrderStatus;
    total?: number | null;
  },
): Promise<number> => pushOrderMilestone(db, input);

/**
 * The first message a shopper gets: the order exists and they can watch it.
 * Sent from /api/orders right after the order row is committed and the staff
 * bell has rung.
 */
export const notifyCustomerOrderPlaced = async (
  db: SupabaseClient,
  input: { phone: string | null | undefined; orderNo: string; total?: number | null },
): Promise<number> => pushOrderMilestone(db, { ...input, kind: "placed" });

/** Payment decisions have no status machine of their own — an explicit event. */
export const notifyCustomerOfPayment = async (
  db: SupabaseClient,
  input: {
    phone: string | null | undefined;
    orderNo: string;
    total?: number | null;
  },
): Promise<number> =>
  pushOrderMilestone(db, { ...input, kind: "payment-verified" });
