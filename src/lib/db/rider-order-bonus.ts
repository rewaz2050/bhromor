import "server-only";

/**
 * Peak-hour / rainy-day bonus (202610020015): settings and the sweep. The award RPC is
 * SERVICE ROLE ONLY, so the sweep takes the service client; the settings are written
 * through the staff member's own client so RLS and the money audit trigger see the real actor.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { AdminInputError } from "./admin";
import { isMissingDbObject } from "./riders";
import {
  ORDER_BONUS_DEFAULTS,
  ORDER_BONUS_KEYS,
  anyOrderBonusOn,
  orderBonusMessage,
  parseOrderBonusInput,
  sanitizeOrderBonusSettings,
  type OrderBonusAward,
  type OrderBonusSettings,
} from "../rider-order-bonus";

/** Never throws: a missing table/key means "switched off". */
export const readOrderBonusSettings = async (db: SupabaseClient): Promise<OrderBonusSettings> => {
  try {
    const { data, error } = await db.from("site_settings").select("key,value").in("key", Object.values(ORDER_BONUS_KEYS));
    if (error || !Array.isArray(data)) return ORDER_BONUS_DEFAULTS;
    const raw: Partial<Record<keyof OrderBonusSettings, unknown>> = {};
    for (const row of data as { key: string; value: unknown }[]) {
      for (const [field, key] of Object.entries(ORDER_BONUS_KEYS)) {
        if (row.key === key) raw[field as keyof OrderBonusSettings] = row.value;
      }
    }
    return sanitizeOrderBonusSettings(raw);
  } catch {
    return ORDER_BONUS_DEFAULTS;
  }
};

export const writeOrderBonusSettings = async (db: SupabaseClient, raw: unknown): Promise<OrderBonusSettings> => {
  const parsed = parseOrderBonusInput(raw);
  if (!parsed.ok) throw new AdminInputError(parsed.error, 422);
  const rows = Object.entries(ORDER_BONUS_KEYS).map(([field, key]) => ({
    key,
    value: parsed.settings[field as keyof OrderBonusSettings],
  }));
  const { error } = await db.from("site_settings").upsert(rows, { onConflict: "key" });
  if (error) throw new Error("Could not save the order-bonus settings.");
  return parsed.settings;
};

export interface OrderBonusSweepResult {
  status: "ran" | "skipped" | "failed";
  did: number;
  detail: string;
}

/**
 * The cron job: ask the database to pay whatever is due (idempotent there), then tell each
 * rider once per kind. Does nothing at all while both bonuses are off.
 */
export const runOrderBonusSweep = async (
  service: SupabaseClient,
  deps: { pushRider: (riderId: string, title: string, body: string) => Promise<unknown> },
): Promise<OrderBonusSweepResult> => {
  const settings = await readOrderBonusSettings(service);
  if (!anyOrderBonusOn(settings)) return { status: "skipped", did: 0, detail: "peak/rain bonuses are off (staff opt-in)" };
  const { data, error } = await service.rpc("ps_award_order_bonuses");
  if (error) {
    if (isMissingDbObject(error)) return { status: "skipped", did: 0, detail: "order bonuses not migrated (202610020015)" };
    return { status: "failed", did: 0, detail: "order-bonus sweep failed" };
  }
  const result = (data ?? {}) as { peak?: number; rain?: number; total?: number; awards?: OrderBonusAward[] };
  const awards = Array.isArray(result.awards) ? result.awards : [];
  const grouped = new Map<string, { riderId: string; kind: OrderBonusAward["kind"]; count: number; total: number }>();
  for (const a of awards) {
    const key = `${a.riderId}:${a.kind}`;
    const g = grouped.get(key) ?? { riderId: a.riderId, kind: a.kind, count: 0, total: 0 };
    g.count += 1;
    g.total += Number(a.amount) || 0;
    grouped.set(key, g);
  }
  for (const g of grouped.values()) {
    try {
      const msg = orderBonusMessage(g.kind, g.count, g.total);
      await deps.pushRider(g.riderId, msg.title, msg.body);
    } catch {
      // The money is already in the wallet; only the nudge is lost.
    }
  }
  const did = (result.peak ?? 0) + (result.rain ?? 0);
  return {
    status: "ran",
    did,
    detail: did === 0 ? "nothing due" : `${result.peak ?? 0} peak + ${result.rain ?? 0} rain bonus(es), ৳${Math.round((result.total ?? 0) / 100)} paid`,
  };
};
