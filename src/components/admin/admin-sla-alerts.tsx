"use client";

import { useMemo } from "react";
import type { Order } from "@/lib/orders";
import { formatBdt } from "@/lib/format";

export function AdminSlaAlerts({ orders }: { orders: Order[] }) {
  const breaches = useMemo(() => {
    const now = Date.now();
    return orders
      .filter((o) => o.status !== "delivered" && o.status !== "cancelled")
      .map((o) => {
        const ageMin = (now - o.createdAt) / 60000;
        let limit = 90; // z1
        if (o.zoneId === "z2") limit = 120;
        if (o.zoneId === "z4") limit = 180;
        if ((o as any).isExpress) limit = 60;
        const breached = ageMin > limit;
        const scheduledBreached =
          (o as any).scheduledAt &&
          now > new Date((o as any).scheduledAt).getTime() + 60 * 60 * 1000;
        return { order: o, ageMin, limit, breached, scheduledBreached };
      })
      .filter((x) => x.breached || x.scheduledBreached)
      .sort((a, b) => b.ageMin - a.ageMin)
      .slice(0, 20);
  }, [orders]);

  if (breaches.length === 0) {
    return (
      <div className="rounded-2xl bg-emerald-50 p-4 ring-1 ring-emerald-200 text-sm text-emerald-900">
        ✅ No SLA breaches — all orders within {`90/120/180 min`} + express 60 min. Sunamganj Sadar live.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-bold uppercase tracking-wider text-rose-800">
        🚨 SLA Breaches ({breaches.length}) — needs attention
      </h3>
      <div className="grid gap-2">
        {breaches.map(({ order, ageMin, limit, scheduledBreached }) => (
          <div
            key={order.id}
            className="flex items-center justify-between rounded-xl bg-rose-50 p-3 ring-1 ring-rose-200"
          >
            <div>
              <p className="font-mono text-xs font-bold">
                #{order.id} · {order.zoneName} · {order.status}
                {(order as any).isExpress ? " · Express" : ""}
              </p>
              <p className="text-xs text-ink-soft">
                Age {Math.round(ageMin)} min / limit {limit} min{" "}
                {scheduledBreached && (
                  <span className="ml-2 rounded-full bg-amber-200 px-2 py-0.5 text-[10px] font-bold text-amber-900">
                    Scheduled overdue
                  </span>
                )}
              </p>
              <p className="text-xs">
                {order.customer.area} · {formatBdt(order.total)} · {order.customer.phone}
              </p>
            </div>
            <a
              href={`/admin/orders/${order.id}`}
              className="rounded-full bg-forest-800 px-3 py-1 text-xs font-semibold text-white"
            >
              Open
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}
