/**
 * Item M — rider scorecards: the staff board read, the auto-suspend switch, and
 * the scheduler sweep (migration 202610020006; every reader tolerates the
 * function being absent).
 */

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  AUTO_SUSPEND_KEY,
  autoSuspendReason,
  normalizeScorecards,
  parseAutoSuspend,
  type Scorecard,
} from "@/lib/rider-quality";
import { isMissingDbObject } from "./riders";

/** null = the migration has not run. */
export const getScorecards = async (db: SupabaseClient, days = 30): Promise<Scorecard[] | null> => {
  const { data, error } = await db.rpc("ps_admin_rider_scorecards", { p_days: days });
  if (error) {
    if (isMissingDbObject(error)) return null;
    throw new Error("scorecards read failed");
  }
  return normalizeScorecards(data);
};

/** Never throws: a missing table/key means OFF. */
export const readAutoSuspend = async (db: SupabaseClient): Promise<boolean> => {
  try {
    const { data, error } = await db.from("site_settings").select("value").eq("key", AUTO_SUSPEND_KEY).maybeSingle();
    if (error || !data) return false;
    return parseAutoSuspend((data as { value: unknown }).value);
  } catch {
    return false;
  }
};

export const writeAutoSuspend = async (db: SupabaseClient, enabled: boolean): Promise<boolean> => {
  const { error } = await db.from("site_settings").upsert({ key: AUTO_SUSPEND_KEY, value: enabled }, { onConflict: "key" });
  if (error) throw new Error("Could not save the auto-suspend setting.");
  return enabled;
};

export interface QualitySweepResult {
  status: "ran" | "skipped" | "failed";
  did: number;
  detail: string;
}

/**
 * Opt-in. With auto-suspend OFF (the default) this does nothing at all. With
 * it ON, riders that meet a HARD rule (see AUTO_SUSPEND) are suspended — but
 * never while they are carrying a job (that order would be stranded); they are
 * re-checked next tick. Staff are told why, the rider is told to call the
 * office, and reinstating is the ordinary "Approve" button on the riders board.
 */
export const runQualitySweep = async (
  service: SupabaseClient,
  nowMs: number,
  deps: {
    notifyStaff: (title: string, body: string) => Promise<void>;
    pushRider: (riderId: string, title: string, body: string) => Promise<unknown>;
  },
): Promise<QualitySweepResult> => {
  if (!(await readAutoSuspend(service))) {
    return { status: "skipped", did: 0, detail: "auto-suspend is off (staff opt-in)" };
  }
  const { data, error } = await service.rpc("ps_rider_scorecards_raw", { p_days: 30 });
  if (error) {
    if (isMissingDbObject(error)) return { status: "skipped", did: 0, detail: "scorecards not migrated (202610020006)" };
    return { status: "failed", did: 0, detail: "scorecard read failed" };
  }
  const due = normalizeScorecards(data)
    .map((card) => ({ card, reason: autoSuspendReason(card, nowMs) }))
    .filter((x): x is { card: Scorecard; reason: string } => x.reason !== null);
  const suspended: { card: Scorecard; reason: string }[] = [];
  let busy = 0;
  for (const { card, reason } of due) {
    if (card.currentLoad > 0) {
      busy += 1;
      continue;
    }
    const patch = {
      status: "suspended",
      is_online: false,
      review_note: `Auto-suspended: ${reason}`.slice(0, 400),
      reviewed_at: new Date(nowMs).toISOString(),
    };
    // .eq("status","active") makes the claim race-safe: a rider staff already
    // suspended/changed is left alone and not announced twice.
    const { data: row, error: updateError } = await service
      .from("riders")
      .update(patch)
      .eq("id", card.id)
      .eq("status", "active")
      .select("id")
      .maybeSingle();
    if (updateError || !row) continue;
    suspended.push({ card, reason });
    try {
      await deps.pushRider(
        card.id,
        "আপনার অ্যাকাউন্ট স্থগিত",
        "কর্মক্ষমতা/ক্যাশ নীতির কারণে অ্যাকাউন্ট স্থগিত হয়েছে — অফিসে যোগাযোগ করুন।",
      );
    } catch {
      /* best-effort */
    }
  }
  if (suspended.length > 0) {
    try {
      await deps.notifyStaff(
        `${suspended.length} rider(s) auto-suspended`,
        suspended.map((s) => `${s.card.name}: ${s.reason}`).join(". ") + ". Reinstate from Riders → Approve if this is wrong.",
      );
    } catch {
      /* never block */
    }
  }
  return {
    status: "ran",
    did: suspended.length,
    detail: `${suspended.length} suspended, ${busy} deferred (carrying a job), ${due.length} met a rule`,
  };
};
