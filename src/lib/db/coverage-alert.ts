/**
 * Item S — tell staff the moment an order becomes dispatchable with nobody to
 * take it. The dispatch board shows the reason, but only to someone looking at
 * it; the staff bell (+ push) reaches the owner who isn't. Best-effort: never
 * throws, never blocks the "Ready" tap, and stays silent when a rider can take
 * the order (or when the only reason is an unverified wallet payment — that has
 * its own prompt).
 */

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Order } from "@/lib/orders";
import { diagnoseCoverage } from "@/lib/dispatch-coverage";
import { readDispatchSettings } from "./dispatch-settings";
import { notifyStaff } from "./engagement";
import { mapRider } from "./mappers";
import type { DbRider } from "./types";

export const notifyIfNoCoverage = async (
  service: SupabaseClient,
  order: Pick<Order, "id" | "zoneId" | "zoneName" | "status" | "timeline" | "createdAt"> & { isPickup?: boolean },
): Promise<boolean> => {
  try {
    // Counter pickups never ride; nothing to cover.
    if (order.isPickup) return false;
    const [{ data, error }, settings] = await Promise.all([
      service.from("riders").select("*").eq("status", "active").limit(300),
      readDispatchSettings(service),
    ]);
    if (error || !data) return false;
    const riders = (data as DbRider[]).map(mapRider);
    const coverage = diagnoseCoverage(order, riders, { cashCap: settings.cashCap, loadLimit: settings.loadLimit });
    if (coverage.severity !== "alert") return false;
    await notifyStaff(service, {
      kind: "order",
      title: `⚠ No rider can take ${order.id}`,
      body: `${coverage.label}. ${coverage.action}`,
      href: "/admin/deliveries",
    });
    return true;
  } catch {
    return false;
  }
};
