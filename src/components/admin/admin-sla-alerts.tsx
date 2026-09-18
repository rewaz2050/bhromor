"use client";

import { useMemo } from "react";
import Link from "next/link";
import { STATUS_META, type Order } from "@/lib/orders";
import { formatBdt } from "@/lib/format";
import { useNow } from "@/lib/use-now";
import { primaryAction } from "@/lib/order-actions";

/** Minutes an order may stay open per zone before it counts as a breach. */
export const slaLimitMinutes = (o: Pick<Order, "zoneId" | "isExpress">): number => {
  if (o.isExpress) return 60;
  if (o.zoneId === "z2") return 120;
  if (o.zoneId === "z4") return 180;
  return 90; // z1
};

export function AdminSlaAlerts({ orders }: { orders: Order[] }) {
  // Wall-clock comes from a subscription (ticks once a minute), never from
  // Date.now() inside render — that made server and client HTML disagree.
  const now = useNow(60_000);
  const breaches = useMemo(() => {
    return orders
      .filter((o) => o.status !== "delivered" && o.status !== "cancelled")
      .map((o) => {
        // A slot order (evening / scheduled) is not "late" while its window
        // is still ahead — its clock starts at the slot, not at placement.
        const scheduledFuture = o.scheduledAt !== undefined && o.scheduledAt > now;
        const ageMin = (now - o.createdAt) / 60000;
        const limit = slaLimitMinutes(o);
        const breached = !scheduledFuture && ageMin > limit;
        const scheduledBreached =
          o.scheduledAt !== undefined &&
          now > o.scheduledAt + 60 * 60 * 1000;
        return { order: o, ageMin, limit, breached, scheduledBreached };
      })
      .filter((x) => x.breached || x.scheduledBreached)
      .sort((a, b) => b.ageMin - a.ageMin)
      .slice(0, 20);
  }, [now, orders]);

  if (breaches.length === 0) {
    return (
      <div className="rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-900 ring-1 ring-emerald-200">
        ✅ No late orders — every open order is inside its delivery window
        (90 min in town, 120 min outskirts, 180 min courier, 60 min express).
      </div>
    );
  }

  return (
    <div className="space-y-3" aria-label="Late orders">
      <h3 className="text-sm font-bold uppercase tracking-wider text-rose-800">
        🚨 {breaches.length} late order{breaches.length === 1 ? "" : "s"} — oldest first
      </h3>
      <div className="grid gap-2">
        {breaches.map(({ order, ageMin, limit, scheduledBreached }) => {
          const next = primaryAction(order, "staff");
          const who =
            next?.kind === "action"
              ? `Next: ${next.label}`
              : next?.kind === "blocked"
                ? next.reason
                : next?.kind === "wait"
                  ? next.reason
                  : "";
          return (
            <div
              key={order.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-rose-50 p-3 ring-1 ring-rose-200"
            >
              <div className="min-w-0">
                <p className="font-mono text-xs font-bold">
                  #{order.id} · {order.zoneName} · {STATUS_META[order.status].short}
                  {order.isExpress ? " · Express" : ""}
                  {order.isPickup ? " · Counter pickup" : ""}
                </p>
                <p className="text-xs text-ink-soft">
                  Waiting {Math.round(ageMin)} min (limit {limit} min)
                  {who ? ` · ${who}` : ""}
                  {scheduledBreached && (
                    <span className="ml-2 rounded-full bg-amber-200 px-2 py-0.5 text-[10px] font-bold text-amber-900">
                      Scheduled slot missed
                    </span>
                  )}
                </p>
                <p className="text-xs">
                  {order.customer.area} · {formatBdt(order.total)} ·{" "}
                  <a href={`tel:${order.customer.phone}`} className="underline underline-offset-2">
                    {order.customer.phone}
                  </a>
                </p>
              </div>
              <Link
                href={`/admin/orders/${order.id}`}
                className="rounded-full bg-forest-800 px-3 py-1 text-xs font-semibold text-white hover:bg-forest-700"
              >
                Open
              </Link>
            </div>
          );
        })}
      </div>
    </div>
  );
}
