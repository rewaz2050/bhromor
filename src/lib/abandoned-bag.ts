/**
 * The abandoned bag (UX plan §5, R10) — server half.
 *
 * Rules, in the order they matter:
 *   • Only devices that opted in to "drops & offers" push are ever stored
 *     (`customer_push_subscriptions.marketing`); everybody else's PUT is a
 *     no-op 204. Order-update consent is NOT bag-nag consent.
 *   • One reminder per bag, about 24 h after the last change, never for a
 *     bag older than 72 h (stale), never twice within 7 days on a device.
 *   • No SMS, no email — a push, or nothing.
 */

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { bnDigits } from "@/lib/arrival";
import { formatBdt } from "@/lib/format";
import type { Language } from "@/lib/translations";
import {
  customerPushSaveFailureReason,
  sendToDevices,
  type CustomerSubscription,
} from "@/lib/customer-push";

export const BAG_SNAPSHOTS_MIGRATION = "supabase/migrations/202609270003_bag_snapshots.sql";

/** Untouched for at least this long → remind. */
export const BAG_REMIND_AFTER_MS = 24 * 60 * 60 * 1000;
/** Older than this → the shopper has moved on; leave them alone. */
export const BAG_STALE_AFTER_MS = 72 * 60 * 60 * 1000;
/** Never two bag reminders on one device inside this window. */
export const BAG_REMIND_GAP_MS = 7 * 24 * 60 * 60 * 1000;

export interface BagSnapshotInput {
  endpoint: unknown;
  count: unknown;
  subtotal: unknown;
  topName?: unknown;
  topSlug?: unknown;
  lang?: unknown;
}

const clean = (v: unknown, max: number): string =>
  typeof v === "string" ? v.trim().slice(0, max) : "";
const int = (v: unknown, max: number): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(0, Math.floor(n))) : 0;
};

export type BagSnapshotResult =
  | { ok: true; stored: boolean }
  | { ok: false; reason: "invalid" | "missing_table" | "error" };

/**
 * Store (or clear) the bag for one push device. Returns `stored: false` for
 * a device that never opted in — the caller answers 204 and nothing is kept.
 */
export const saveBagSnapshot = async (
  db: SupabaseClient,
  input: BagSnapshotInput,
): Promise<BagSnapshotResult> => {
  const endpoint = clean(input.endpoint, 500);
  if (!endpoint.startsWith("https://")) return { ok: false, reason: "invalid" };
  const { data: sub, error: subError } = await db
    .from("customer_push_subscriptions")
    .select("endpoint, marketing")
    .eq("endpoint", endpoint)
    .maybeSingle();
  if (subError) {
    return { ok: false, reason: customerPushSaveFailureReason(subError) ?? "error" };
  }
  if (!sub || (sub as { marketing?: boolean }).marketing !== true) {
    return { ok: true, stored: false };
  }
  const row = {
    endpoint,
    count: int(input.count, 99),
    subtotal: int(input.subtotal, 100_000_000),
    top_name: clean(input.topName, 120),
    top_slug: clean(input.topSlug, 160).replace(/[^a-z0-9\u0980-\u09ff-]/gi, ""),
    lang: input.lang === "en" ? "en" : "bn",
    touched_at: new Date().toISOString(),
  };
  const { error } = await db.from("bag_snapshots").upsert(row, { onConflict: "endpoint" });
  if (error) return { ok: false, reason: customerPushSaveFailureReason(error) ?? "error" };
  return { ok: true, stored: true };
};

/** The one reminder — copy in the device's language, Bengali digits. */
export const bagReminderMessage = (
  bag: { count: number; subtotal: number; topName: string },
  lang: Language,
): { title: string; body: string; href: string } => {
  const n = bag.count;
  const money = formatBdt(bag.subtotal);
  const name = bag.topName || "";
  if (lang === "bn") {
    const count = bnDigits(String(n));
    return {
      title: n === 1 ? "আপনার ব্যাগে একটা পিস অপেক্ষা করছে" : `আপনার ব্যাগে ${count}টি পিস অপেক্ষা করছে`,
      body: `${name ? `${name}${n > 1 ? " ও আরও" : ""} — ` : ""}${money} · ক্যাশ অন ডেলিভারি · সদরে ৪৫–৫০ মিনিটে।`,
      href: "/cart",
    };
  }
  return {
    title: n === 1 ? "One piece is waiting in your bag" : `${n} pieces are waiting in your bag`,
    body: `${name ? `${name}${n > 1 ? " and more" : ""} — ` : ""}${money} · cash on delivery · 45–50 min in Sadar.`,
    href: "/cart",
  };
};

export interface AbandonedBagRun {
  status: "ran" | "skipped" | "failed";
  did: number;
  detail: string;
}

/**
 * The scheduler's job: find bags untouched for 24–72 h on opted-in devices
 * with no reminder in the last 7 days, push once, stamp `reminded_at`
 * whether or not the push service accepted (a dead device is dropped by the
 * fan-out itself; a flaky one is not retried into a nag).
 */
export const runAbandonedBags = async (
  db: SupabaseClient,
  nowMs: number,
): Promise<AbandonedBagRun> => {
  const { data, error } = await db
    .from("bag_snapshots")
    .select("endpoint, count, subtotal, top_name, lang, touched_at, reminded_at")
    .gt("count", 0)
    .lte("touched_at", new Date(nowMs - BAG_REMIND_AFTER_MS).toISOString())
    .gte("touched_at", new Date(nowMs - BAG_STALE_AFTER_MS).toISOString())
    .limit(100);
  if (error) {
    const reason = customerPushSaveFailureReason(error);
    if (reason === "missing_table") {
      return { status: "skipped", did: 0, detail: `bag_snapshots table nai — ${BAG_SNAPSHOTS_MIGRATION} run korun` };
    }
    return { status: "failed", did: 0, detail: error.message };
  }
  const rows = ((data ?? []) as Record<string, unknown>[]).filter((r) => {
    const reminded = typeof r.reminded_at === "string" ? Date.parse(r.reminded_at) : NaN;
    return Number.isNaN(reminded) || nowMs - reminded >= BAG_REMIND_GAP_MS;
  });
  if (rows.length === 0) return { status: "ran", did: 0, detail: "no bag waiting 24h+" };

  const endpoints = rows.map((r) => String(r.endpoint));
  const { data: subs } = await db
    .from("customer_push_subscriptions")
    .select("endpoint, p256dh, auth, phone, lang, marketing")
    .in("endpoint", endpoints)
    .eq("marketing", true);
  const byEndpoint = new Map<string, CustomerSubscription>();
  for (const s of (subs ?? []) as Record<string, unknown>[]) {
    byEndpoint.set(String(s.endpoint), {
      endpoint: String(s.endpoint),
      p256dh: String(s.p256dh ?? ""),
      auth: String(s.auth ?? ""),
      phone: String(s.phone ?? ""),
      lang: s.lang === "en" ? "en" : "bn",
    });
  }
  let sent = 0;
  let stamped = 0;
  for (const r of rows) {
    const sub = byEndpoint.get(String(r.endpoint));
    const stamp = async () => {
      const { error: upError } = await db
        .from("bag_snapshots")
        .update({ reminded_at: new Date(nowMs).toISOString() })
        .eq("endpoint", String(r.endpoint));
      if (!upError) stamped += 1;
    };
    if (!sub) {
      // Opted out since the snapshot — never send, but close the window.
      await stamp();
      continue;
    }
    const bag = {
      count: Number(r.count) || 0,
      subtotal: Number(r.subtotal) || 0,
      topName: typeof r.top_name === "string" ? r.top_name : "",
    };
    let accepted = 0;
    try {
      accepted = await sendToDevices(db, [sub], (lang) => bagReminderMessage(bag, lang));
    } catch {
      accepted = 0;
    }
    if (accepted > 0) sent += 1;
    await stamp();
  }
  return {
    status: "ran",
    did: sent,
    detail: `${sent} bag reminder(s) sent · ${stamped} closed · ${rows.length} due`,
  };
};
