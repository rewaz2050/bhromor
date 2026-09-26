/**
 * The shop's clock — every job that has to happen even when nobody opens the
 * panel (2026-09-24).
 *
 * Until now the app only acted when a human did: a rider's offer expired when
 * somebody next loaded the dispatch board, a shopper learned the parcel was
 * coming only if the shop called, and the owner knew yesterday's numbers only
 * by opening `/admin`. This module is the other half — a token-gated tick that
 * `.github/workflows/cron.yml` calls every 15 minutes and that runs three jobs:
 *
 *   1. `expire-offers`      — `ps_expire_stale_offers`, so a rider who never
 *                             answered does not hold an order hostage until an
 *                             admin happens to look.
 *   2. `delivery-reminders` — ~2 hours before the window the shopper picked at
 *                             checkout, push "আজ আপনার পার্সেল আসছে".
 *   3. `daily-digest`       — at 9am Dhaka, one staff push with yesterday's
 *                             takings and what is piling up.
 *
 * Rules that keep it safe to run 96 times a day:
 *   • **Nothing here is required for correctness.** The tracker, the panel and
 *     the phone call are still the guarantees; a tick that fails changes
 *     nothing a shopper can see in a wrong way.
 *   • **One-shot jobs are claimed, not assumed.** A mark row is inserted
 *     before the work (cron_marks, migration 202609240002) and released when
 *     the work reached nobody, so a retry is possible but a duplicate nag is
 *     not.
 *   • **A missing marks table skips, never spams.** Without the migration the
 *     tick reports `missing_table` and leaves the two one-shot jobs alone —
 *     the offer sweep (idempotent) still runs.
 *   • **Every job is reported.** The JSON the caller gets back says what ran,
 *     what it touched and why it stopped, so "is the scheduler working?" is
 *     answered by the response body, not by guessing.
 */

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { dhakaDayEndMs, dhakaDayStartMs } from "@/lib/campaign";
import { expireStaleAssignments } from "@/lib/db/riders";
import { notifyStaff } from "@/lib/db/engagement";
import { pushCustomerMessage } from "@/lib/customer-push";
import { customerPushMessage } from "@/lib/notify-messages";
import { dhakaDateString, dhakaParts, deliverySlotSummary } from "@/lib/delivery-slots";
import { digestBody, digestHref, digestTitle, type DigestStats } from "@/lib/digest";
import type { Language } from "@/lib/translations";

export type CronJobName = "expire-offers" | "delivery-reminders" | "daily-digest";

export interface CronJobReport {
  job: CronJobName;
  /** `ran` = it did its work; `skipped` = nothing due / no table; `failed`. */
  status: "ran" | "skipped" | "failed";
  /** How many people, orders or messages this run touched. */
  did: number;
  /** One line for the log — why it did what it did. */
  detail: string;
}

export interface CronTickResult {
  at: string;
  jobs: CronJobReport[];
}

/** Orders that can still receive a "your parcel is coming" reminder. */
const DELIVERABLE_STATUSES = [
  "confirmed",
  "preparing",
  "ready-for-pickup",
  "courier-assigned",
  "out-for-delivery",
] as const;

/** Everything not finished — the digest's "still open" number. */
const OPEN_STATUSES = ["pending", ...DELIVERABLE_STATUSES] as const;

/** How far ahead of the promised window the reminder goes out. */
const REMIND_LOOKAHEAD_MS = 2 * 60 * 60 * 1000;

/** 9am in Dhaka — after the shop opens, before the day's rush. */
const DIGEST_HOUR_DHAKA = 9;

const LAST_RUN_KEY = "cron:last-run";

const iso = (ms: number): string => new Date(ms).toISOString();

/* ------------------------------------------------------------------ */
/* Marks                                                               */
/* ------------------------------------------------------------------ */

/** Thrown when `cron_marks` is not there — the caller reports, never spams. */
export class CronMarksMissingError extends Error {
  constructor() {
    super(
      "cron_marks table nai — Supabase → SQL Editor e supabase/migrations/202609240002_cron_marks.sql run korun.",
    );
    this.name = "CronMarksMissingError";
  }
}

const missingTable = (error: { code?: string; message?: string } | null | undefined): boolean => {
  if (!error) return false;
  const code = typeof error.code === "string" ? error.code : "";
  const message = typeof error.message === "string" ? error.message.toLowerCase() : "";
  return (
    code === "42P01" ||
    code === "PGRST205" ||
    message.includes("does not exist") ||
    message.includes("could not find the table") ||
    message.includes("schema cache")
  );
};

/**
 * Claim a one-shot job. `true` = this tick owns it, `false` = already done
 * (the primary key refuses the second INSERT), throws when the table is
 * missing so the caller can skip instead of repeating the work every 15 min.
 */
export const claimMark = async (service: SupabaseClient, key: string): Promise<boolean> => {
  const { error } = await service
    .from("cron_marks")
    .insert({ key, ran_at: new Date().toISOString() });
  if (!error) return true;
  if (error.code === "23505") return false;
  if (missingTable(error)) throw new CronMarksMissingError();
  throw new Error(`cron mark claim failed: ${error.message ?? "unknown"}`);
};

/** Let a later tick try again (the work reached nobody or blew up). */
export const releaseMark = async (service: SupabaseClient, key: string): Promise<void> => {
  try {
    await service.from("cron_marks").delete().eq("key", key);
  } catch {
    // A stuck mark only means "do not retry this one" — never a crash.
  }
};

/* ------------------------------------------------------------------ */
/* Jobs                                                                */
/* ------------------------------------------------------------------ */

/**
 * Stale rider offers expire, so the order goes back on the dispatch board
 * without waiting for an admin to open it. Idempotent, so it runs on every
 * tick even when the marks table is missing.
 */
const runExpireOffers = async (service: SupabaseClient, nowMs: number): Promise<CronJobReport> => {
  // Count first: the RPC reports nothing, and "how many offers were sitting
  // dead" is the one number worth logging.
  let stale = 0;
  try {
    const { count } = await service
      .from("delivery_assignments")
      .select("id", { count: "exact", head: true })
      // The column is `state` (checked against the schema) — `status` made
      // this count fail silently on EVERY tick and the report always said
      // "0 stale offers" no matter how many actually expired.
      .eq("state", "offered")
      .lt("expires_at", iso(nowMs));
    stale = count ?? 0;
  } catch {
    stale = 0;
  }
  try {
    await expireStaleAssignments(service);
  } catch (err) {
    return {
      job: "expire-offers",
      status: "failed",
      did: 0,
      detail: err instanceof Error ? err.message : "ps_expire_stale_offers failed",
    };
  }
  return {
    job: "expire-offers",
    status: "ran",
    did: stale,
    detail:
      stale > 0
        ? `${stale} stale rider offer(s) expired and re-offered`
        : "no stale rider offers",
  };
};

const slotLabel = (
  row: { delivery_window: string | null; scheduled_at: string },
  lang: Language,
): string => {
  const ms = Date.parse(row.scheduled_at);
  const summary = deliverySlotSummary(
    {
      deliveryWindow: row.delivery_window ?? null,
      scheduledAt: Number.isNaN(ms) ? null : ms,
    },
    lang,
  );
  if (summary) return summary;
  return lang === "bn" ? "আজ" : "today";
};

/**
 * "আজ আপনার পার্সেল আসছে" — pushed about two hours before the window the
 * shopper chose. Claimed per order, and the claim is released when nothing was
 * delivered (no device yet, every device dead): a shopper who turns
 * notifications on later in that window still gets it, one who never does
 * leaves the mark unspent instead of burning it.
 */
const runDeliveryReminders = async (
  service: SupabaseClient,
  nowMs: number,
): Promise<CronJobReport> => {
  const { data, error } = await service
    .from("orders")
    .select("id, order_no, customer_phone, scheduled_at, delivery_window")
    .not("scheduled_at", "is", null)
    .in("status", [...DELIVERABLE_STATUSES])
    .gt("scheduled_at", iso(nowMs))
    .lte("scheduled_at", iso(nowMs + REMIND_LOOKAHEAD_MS))
    .limit(50);
  if (error) {
    return { job: "delivery-reminders", status: "failed", did: 0, detail: error.message };
  }
  const rows = (data ?? []) as {
    id: string;
    order_no: string | null;
    customer_phone: string | null;
    scheduled_at: string;
    delivery_window: string | null;
  }[];
  let sent = 0;
  let alreadyClaimed = 0;
  for (const row of rows) {
    if (!row.order_no) continue;
    const key = `delivery-soon:${row.id}`;
    if (!(await claimMark(service, key))) {
      alreadyClaimed += 1;
      continue;
    }
    let accepted = 0;
    try {
      accepted = await pushCustomerMessage(service, {
        phone: row.customer_phone,
        build: (lang) =>
          customerPushMessage({
            kind: "delivery-today",
            orderNo: row.order_no ?? "",
            phone: row.customer_phone,
            when: slotLabel(row, lang),
            lang,
          }),
      });
    } catch {
      accepted = 0;
    }
    if (accepted > 0) {
      sent += 1;
    } else {
      // Nobody reachable — leave the window open for a later opt-in.
      await releaseMark(service, key);
    }
  }
  return {
    job: "delivery-reminders",
    status: "ran",
    did: sent,
    detail:
      rows.length === 0
        ? "no delivery window opens in the next 2 hours"
        : `${sent} reminder push(es) sent · ${alreadyClaimed} already reminded · ${rows.length} in window`,
  };
};

/* ------------------------------------------------------------------ */
/* Digest                                                              */
/* ------------------------------------------------------------------ */

/** A head-only count; 0 on any error so one bad number never kills a digest. */
const headCount = async (
  query: PromiseLike<{ count: number | null; error: unknown }>,
): Promise<number> => {
  try {
    const { count, error } = await query;
    return error ? 0 : (count ?? 0);
  } catch {
    return 0;
  }
};

/** Everything the digest prints, gathered in one pass, each line best-effort. */
export const gatherDigest = async (
  service: SupabaseClient,
  nowMs: number,
): Promise<DigestStats> => {
  const today = dhakaDateString(nowMs);
  const yesterday = dhakaDateString(nowMs - 86_400_000);
  const yStart = dhakaDayStartMs(yesterday) ?? nowMs - 86_400_000;
  const yEnd = dhakaDayEndMs(yesterday) ?? nowMs;
  const tStart = dhakaDayStartMs(today) ?? nowMs;
  const tEnd = dhakaDayEndMs(today) ?? nowMs;

  let yesterdayOrders = 0;
  let yesterdayRevenuePaisa = 0;
  try {
    const { data } = await service
      .from("orders")
      .select("total, status")
      .gte("created_at", iso(yStart))
      .lte("created_at", iso(yEnd))
      .limit(500);
    const kept = ((data ?? []) as { total?: number | null; status?: string | null }[]).filter(
      (row) => row.status !== "cancelled",
    );
    yesterdayOrders = kept.length;
    yesterdayRevenuePaisa = kept.reduce((sum, row) => sum + (Number(row.total) || 0), 0);
  } catch {
    yesterdayOrders = 0;
  }

  const todayOrders = await headCount(
    service.from("orders").select("id", { count: "exact", head: true }).gte("created_at", iso(tStart)),
  );
  const openOrders = await headCount(
    service
      .from("orders")
      .select("id", { count: "exact", head: true })
      .in("status", [...OPEN_STATUSES]),
  );
  const lowStock = await headCount(
    service
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("active", true)
      .eq("in_stock", true)
      .eq("low_stock", true),
  );
  const scheduledToday = await headCount(
    service
      .from("orders")
      .select("id", { count: "exact", head: true })
      .not("scheduled_at", "is", null)
      .gte("scheduled_at", iso(tStart))
      .lte("scheduled_at", iso(tEnd))
      .in("status", [...DELIVERABLE_STATUSES]),
  );
  const waitingWatches =
    (await headCount(service.from("price_watches").select("id", { count: "exact", head: true }))) +
    (await headCount(service.from("stock_watches").select("id", { count: "exact", head: true })));

  return {
    yesterdayOrders,
    yesterdayRevenuePaisa,
    todayOrders,
    openOrders,
    lowStock,
    waitingWatches,
    scheduledToday,
  };
};

/**
 * One staff push a day, dated by the Dhaka day so a tick storm, a retry or a
 * second scheduler cannot produce a second digest.
 */
const runDailyDigest = async (
  service: SupabaseClient,
  nowMs: number,
): Promise<CronJobReport> => {
  if (dhakaParts(nowMs).hour < DIGEST_HOUR_DHAKA) {
    return {
      job: "daily-digest",
      status: "skipped",
      did: 0,
      detail: `before ${DIGEST_HOUR_DHAKA}am Dhaka — the digest waits for the shop to open`,
    };
  }
  const key = `digest:${dhakaDateString(nowMs)}`;
  if (!(await claimMark(service, key))) {
    return { job: "daily-digest", status: "skipped", did: 0, detail: "already sent today" };
  }
  try {
    const stats = await gatherDigest(service, nowMs);
    await notifyStaff(service, {
      kind: "system",
      title: digestTitle(),
      body: digestBody(stats),
      href: digestHref(),
    });
    return {
      job: "daily-digest",
      status: "ran",
      did: 1,
      detail: `digest sent — ${stats.yesterdayOrders} order(s) yesterday, ${stats.openOrders} open`,
    };
  } catch (err) {
    await releaseMark(service, key);
    return {
      job: "daily-digest",
      status: "failed",
      did: 0,
      detail: err instanceof Error ? err.message : "digest failed",
    };
  }
};

/* ------------------------------------------------------------------ */
/* The tick                                                            */
/* ------------------------------------------------------------------ */

/**
 * Run every job once. Never throws: a scheduler that answers 500 tells the
 * caller nothing, while this answer says which job broke and why.
 */
export const runCronTick = async (input: {
  service: SupabaseClient;
  now?: Date;
}): Promise<CronTickResult> => {
  const nowMs = (input.now ?? new Date()).getTime();
  const jobs: CronJobReport[] = [];

  try {
    jobs.push(await runExpireOffers(input.service, nowMs));
  } catch (err) {
    jobs.push({
      job: "expire-offers",
      status: "failed",
      did: 0,
      detail: err instanceof Error ? err.message : "expire sweep failed",
    });
  }

  for (const run of [runDeliveryReminders, runDailyDigest]) {
    const job: CronJobName = run === runDeliveryReminders ? "delivery-reminders" : "daily-digest";
    try {
      jobs.push(await run(input.service, nowMs));
    } catch (err) {
      if (err instanceof CronMarksMissingError) {
        jobs.push({ job, status: "skipped", did: 0, detail: err.message });
      } else {
        jobs.push({
          job,
          status: "failed",
          did: 0,
          detail: err instanceof Error ? err.message : `${job} failed`,
        });
      }
    }
  }

  // Remembered for /api/health: "the scheduler is alive" is a row, not a hope.
  try {
    await input.service
      .from("cron_marks")
      .upsert({ key: LAST_RUN_KEY, ran_at: iso(nowMs) }, { onConflict: "key" });
  } catch {
    // Only the health line loses this; the jobs above already ran.
  }

  return { at: iso(nowMs), jobs };
};

/** Whether a scheduler is wired up at all, and when it last knocked. */
export const cronStatus = async (
  service: SupabaseClient,
): Promise<{ configured: boolean; marksReady: boolean; lastRunAt: string | null }> => {
  const configured = (process.env.CRON_SECRET ?? "").trim() !== "";
  try {
    const { data, error } = await service
      .from("cron_marks")
      .select("ran_at")
      .eq("key", LAST_RUN_KEY)
      .limit(1);
    if (error) return { configured, marksReady: !missingTable(error), lastRunAt: null };
    const row = ((data ?? []) as { ran_at?: string }[])[0];
    return { configured, marksReady: true, lastRunAt: row?.ran_at ?? null };
  } catch {
    return { configured, marksReady: false, lastRunAt: null };
  }
};
