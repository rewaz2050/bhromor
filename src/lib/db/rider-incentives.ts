import "server-only";

/**
 * Rider incentives (item V, 202610020010): settings, the sweep and the rider's
 * own view. The award RPCs are SERVICE ROLE ONLY, so everything here takes the
 * service client; callers (cron, the rider's session API, the apply route,
 * staff routes) have already proven who is asking.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { AdminInputError } from "./admin";
import { isMissingDbObject } from "./riders";
import {
  INCENTIVE_DEFAULTS,
  INCENTIVE_KEYS,
  anyIncentiveOn,
  awardMessage,
  dailyProgress,
  normalizeReferralCode,
  parseIncentiveInput,
  sanitizeIncentiveSettings,
  type IncentiveAward,
  type IncentiveSettings,
  type ReferralOutcome,
  type RiderIncentiveView,
} from "../rider-incentives";

const DHAKA_MS = 6 * 3_600_000;

/** Dhaka midnight (the start of "today") as a UTC instant. */
const dhakaMidnight = (now: number): number => Math.floor((now + DHAKA_MS) / 86_400_000) * 86_400_000 - DHAKA_MS;

/** Never throws: a missing table/key means "switched off". */
export const readIncentiveSettings = async (db: SupabaseClient): Promise<IncentiveSettings> => {
  try {
    const { data, error } = await db.from("site_settings").select("key,value").in("key", Object.values(INCENTIVE_KEYS));
    if (error || !data) return INCENTIVE_DEFAULTS;
    const raw: Partial<Record<keyof IncentiveSettings, unknown>> = {};
    for (const row of data as { key: string; value: unknown }[]) {
      for (const [field, key] of Object.entries(INCENTIVE_KEYS)) {
        if (row.key === key) raw[field as keyof IncentiveSettings] = row.value;
      }
    }
    return sanitizeIncentiveSettings(raw);
  } catch {
    return INCENTIVE_DEFAULTS;
  }
};

export const writeIncentiveSettings = async (db: SupabaseClient, raw: unknown): Promise<IncentiveSettings> => {
  const parsed = parseIncentiveInput(raw);
  if (!parsed.ok) throw new AdminInputError(parsed.error, 422);
  const rows = Object.entries(INCENTIVE_KEYS).map(([field, key]) => ({
    key,
    value: parsed.settings[field as keyof IncentiveSettings],
  }));
  const { error } = await db.from("site_settings").upsert(rows, { onConflict: "key" });
  if (error) throw new Error("Could not save the incentive settings.");
  return parsed.settings;
};

export interface IncentiveSweepResult {
  status: "ran" | "skipped" | "failed";
  did: number;
  detail: string;
}

/**
 * The cron job: ask the database to pay whatever is due (idempotent there),
 * then tell each rider. Does nothing at all while both bonuses are off.
 */
export const runIncentiveSweep = async (
  service: SupabaseClient,
  deps: { pushRider: (riderId: string, title: string, body: string) => Promise<unknown> },
): Promise<IncentiveSweepResult> => {
  const settings = await readIncentiveSettings(service);
  if (!anyIncentiveOn(settings)) return { status: "skipped", did: 0, detail: "incentives are off (staff opt-in)" };
  const { data, error } = await service.rpc("ps_award_incentives");
  if (error) {
    if (isMissingDbObject(error)) return { status: "skipped", did: 0, detail: "incentives not migrated (202610020010)" };
    return { status: "failed", did: 0, detail: "incentive sweep failed" };
  }
  const result = (data ?? {}) as { daily?: number; referral?: number; total?: number; awards?: IncentiveAward[] };
  const awards = Array.isArray(result.awards) ? result.awards : [];
  for (const award of awards) {
    try {
      const msg = awardMessage(award);
      await deps.pushRider(award.riderId, msg.title, msg.body);
    } catch {
      // The money is already in the wallet; only the nudge is lost.
    }
  }
  const did = (result.daily ?? 0) + (result.referral ?? 0);
  return {
    status: "ran",
    did,
    detail: did === 0 ? "nothing due" : `${result.daily ?? 0} daily + ${result.referral ?? 0} referral bonus(es), ৳${Math.round((result.total ?? 0) / 100)} paid`,
  };
};

/** Link a new applicant to the rider whose code they typed. Never throws — a typo must not fail an application. */
export const registerReferral = async (
  service: SupabaseClient,
  refereeId: string,
  rawCode: unknown,
): Promise<ReferralOutcome | "none"> => {
  const code = normalizeReferralCode(rawCode);
  if (typeof rawCode === "string" && rawCode.trim() === "") return "none";
  if (rawCode === undefined || rawCode === null) return "none";
  if (!code) return "unknown";
  try {
    const { data, error } = await service.rpc("ps_register_rider_referral", { p_referee: refereeId, p_code: code });
    if (error) return "unknown";
    return (["registered", "unknown", "self", "already", "not_new"] as const).includes(data as ReferralOutcome)
      ? (data as ReferralOutcome)
      : "unknown";
  } catch {
    return "unknown";
  }
};

/**
 * The rider's own picture: today's progress, their referral code and how the
 * people they referred are doing. `null` when the migration has not run.
 */
export const getRiderIncentives = async (
  service: SupabaseClient,
  riderId: string,
  now: number = Date.now(),
): Promise<RiderIncentiveView | null> => {
  const settings = await readIncentiveSettings(service);

  const codeRes = await service.rpc("ps_rider_referral_code", { p_rider: riderId });
  if (codeRes.error) {
    if (isMissingDbObject(codeRes.error)) return null;
    throw new Error("referral code read failed");
  }
  const code = typeof codeRes.data === "string" ? codeRes.data : "";

  // Today's delivered legs (returns do not count), by Dhaka day.
  const midnight = dhakaMidnight(now);
  const [todayRes, awardsRes, referralsRes] = await Promise.all([
    service
      .from("delivery_assignments")
      .select("id, orders(is_return)")
      .eq("rider_id", riderId)
      .eq("state", "delivered")
      .gte("delivered_at", new Date(midnight).toISOString()),
    service.from("rider_incentive_awards").select("kind, ref_key, amount").eq("rider_id", riderId),
    service.from("rider_referrals").select("referee_id, rewarded_at, riders!referee_id(name)").eq("referrer_id", riderId).order("created_at", { ascending: false }).limit(20),
  ]);
  if (awardsRes.error || referralsRes.error) {
    if (isMissingDbObject(awardsRes.error) || isMissingDbObject(referralsRes.error)) return null;
    throw new Error("incentive read failed");
  }

  const deliveredToday = ((todayRes.data ?? []) as unknown as { orders?: { is_return?: boolean } | { is_return?: boolean }[] | null }[]).filter((a) => {
    const o = Array.isArray(a.orders) ? a.orders[0] : a.orders;
    return !o?.is_return;
  }).length;

  const awards = (awardsRes.data ?? []) as { kind: string; ref_key: string; amount: number | string }[];
  const todayKey = new Date(now + DHAKA_MS).toISOString().slice(0, 10);
  const todayPaid = awards.some((a) => a.kind === "daily_target" && a.ref_key === todayKey);
  const sum = (kind?: string): number => awards.filter((a) => !kind || a.kind === kind).reduce((n, a) => n + Number(a.amount), 0);

  const referees = (referralsRes.data ?? []) as unknown as {
    referee_id: string;
    rewarded_at: string | null;
    riders?: { name?: string | null } | { name?: string | null }[] | null;
  }[];
  const doneBy = new Map<string, number>();
  if (referees.length > 0) {
    const { data: delivered } = await service
      .from("delivery_assignments")
      .select("rider_id, orders(is_return)")
      .in("rider_id", referees.map((r) => r.referee_id))
      .eq("state", "delivered");
    for (const row of (delivered ?? []) as unknown as { rider_id: string; orders?: { is_return?: boolean } | { is_return?: boolean }[] | null }[]) {
      const o = Array.isArray(row.orders) ? row.orders[0] : row.orders;
      if (!o?.is_return) doneBy.set(row.rider_id, (doneBy.get(row.rider_id) ?? 0) + 1);
    }
  }

  return {
    settings,
    today: settings.dailyTarget > 0 && settings.dailyBonus > 0 ? dailyProgress(deliveredToday, settings.dailyTarget) : null,
    todayPaid,
    referral: {
      code,
      after: settings.referralAfter,
      bonus: settings.referralBonus,
      items: referees.map((r) => {
        const rider = Array.isArray(r.riders) ? r.riders[0] : r.riders;
        // First name only — a referred rider's full name is not for the referrer.
        return { name: (rider?.name ?? "").trim().split(/\s+/)[0] || "Rider", done: doneBy.get(r.referee_id) ?? 0, rewarded: r.rewarded_at != null };
      }),
      totalEarned: sum("referral"),
    },
    totalEarned: sum(),
  };
};
