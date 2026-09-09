"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useAdminDeliveries } from "@/lib/use-admin-deliveries";
import { formatBdt } from "@/lib/format";
import { friendlyWhen } from "@/components/admin/order-ui";
import { IconBox, IconTruck, IconPhone, IconCheck } from "@/components/ui/icons";

const STATE_META: Record<string, { label: string; cls: string }> = {
  offered: { label: "Offered", cls: "bg-amber-100 text-amber-900" },
  accepted: { label: "Accepted", cls: "bg-forest-100 text-forest-800" },
  picked_up: { label: "Picked up", cls: "bg-sky-100 text-sky-800" },
  delivered: { label: "Delivered", cls: "bg-emerald-100 text-emerald-800" },
  cancelled: { label: "Cancelled", cls: "bg-rose-100 text-rose-800" },
  expired: { label: "Expired", cls: "bg-ivory-200 text-ink-soft" },
};

export default function AdminDeliveriesPage() {
  const {
    deliveries,
    awaitingOrders,
    live,
    loading,
    error,
    clearError,
    busyId,
    offer,
    cancel,
  } = useAdminDeliveries();

  const counts = useMemo(() => {
    const out: Record<string, number> = {
      all: deliveries.length,
      offered: 0,
      accepted: 0,
      picked_up: 0,
      delivered: 0,
      cancelled: 0,
      expired: 0,
    };
    for (const d of deliveries) out[d.state] = (out[d.state] ?? 0) + 1;
    return out;
  }, [deliveries]);

  if (loading) {
    return (
      <div className="space-y-6" role="status" aria-label="Loading deliveries">
        <div className="h-24 animate-pulse rounded-2xl bg-paper ring-1 ring-line" />
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="h-20 animate-pulse rounded-2xl bg-paper ring-1 ring-line" />
          <div className="h-20 animate-pulse rounded-2xl bg-paper ring-1 ring-line" />
          <div className="h-20 animate-pulse rounded-2xl bg-paper ring-1 ring-line" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-semibold text-forest-900">
            Rider dispatch board
          </h2>
          <p className="mt-1 max-w-xl text-sm leading-6 text-ink-soft">
            Orders that reach <strong>ready-for-pickup</strong> are offered to
            an eligible rider automatically. Use this board to assign manually
            when nobody was free, or cancel a wrong offer.
          </p>
          {!live && (
            <p className="mt-2 rounded-xl bg-gold-50 px-3 py-2 text-xs text-gold-800 ring-1 ring-gold-200">
              Demo mode: assignments are previewed from the browser order +
              rider stores. Run the Supabase migration <code>008</code> and link
              a rider to manage real dispatch.
            </p>
          )}
        </div>
        {!live && (
          <code className="rounded-lg bg-forest-950 px-3 py-1.5 text-[0.7rem] text-ivory-100">
            demo · offline
          </code>
        )}
      </div>

      {error && (
        <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800 ring-1 ring-rose-200">
          {error}{" "}
          <button type="button" onClick={clearError} className="underline underline-offset-2">
            Dismiss
          </button>
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {(["offered", "accepted", "picked_up", "delivered", "cancelled"] as const).map(
          (state) => (
            <div key={state} className="rounded-2xl bg-paper p-4 ring-1 ring-line">
              <p className="text-[0.65rem] font-bold uppercase tracking-wider text-ink-soft">
                {STATE_META[state].label}
              </p>
              <p className="font-display mt-1 text-2xl font-bold text-forest-900">
                {counts[state] ?? 0}
              </p>
            </div>
          ),
        )}
      </div>

      <section>
        <div className="mb-3 flex items-center gap-2">
          <IconBox className="h-4 w-4 text-forest-700" />
          <h3 className="font-display text-base font-semibold text-forest-900">
            Awaiting dispatch ({awaitingOrders.length})
          </h3>
        </div>
        {awaitingOrders.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line bg-paper p-6 text-center text-sm text-ink-soft">
            No dispatch-ready order is waiting for a rider right now.
          </p>
        ) : (
          <div className="space-y-3">
            {awaitingOrders.map((order) => (
              <div
                key={order.id}
                className="flex flex-wrap items-center gap-3 rounded-2xl bg-paper p-4 ring-1 ring-line"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-xs font-bold text-forest-900">
                    #{order.id}
                  </p>
                  <p className="mt-0.5 text-xs text-ink-soft">
                    {order.customer.name} · {order.zoneName} · {formatBdt(order.total)}
                  </p>
                </div>
                <Link
                  href={`/admin/orders/${order.id}`}
                  className="rounded-full px-3 py-1.5 text-xs font-semibold text-forest-800 ring-1 ring-forest-300 hover:bg-forest-50"
                >
                  Open order
                </Link>
                <button
                  type="button"
                  disabled={busyId === order.id}
                  onClick={() => void offer(order.id)}
                  className="inline-flex items-center gap-1.5 rounded-full bg-forest-800 px-4 py-1.5 text-xs font-semibold text-ivory-50 hover:bg-forest-900 disabled:opacity-50"
                >
                  <IconTruck className="h-3.5 w-3.5" />
                  {busyId === order.id ? "Offering…" : "Assign rider"}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="mb-3 flex items-center gap-2">
          <IconTruck className="h-4 w-4 text-forest-700" />
          <h3 className="font-display text-base font-semibold text-forest-900">
            Assignments ({deliveries.length})
          </h3>
        </div>
        {deliveries.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line bg-paper p-6 text-center text-sm text-ink-soft">
            No delivery assignments yet.
          </p>
        ) : (
          <div className="space-y-3">
            {deliveries.map((job) => {
              const meta = STATE_META[job.state] ?? STATE_META.cancelled;
              return (
                <div
                  key={job.id}
                  className="rounded-2xl bg-paper p-4 ring-1 ring-line space-y-3"
                >
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/admin/orders/${job.orderId}`}
                          className="font-mono text-xs font-bold text-forest-900 hover:underline"
                        >
                          #{job.orderId}
                        </Link>
                        <span className={`rounded-full px-2 py-0.5 text-[0.62rem] font-bold uppercase tracking-wide ${meta.cls}`}>
                          {meta.label}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-ink-soft">
                        {job.riderName} · {job.riderPhone} · {job.order.customer.name} ·{" "}
                        {friendlyWhen(job.offeredAt)}
                      </p>
                    </div>
                    <span className="text-sm font-bold text-forest-900">
                      {formatBdt(job.order.total)}
                    </span>
                  </div>

                  {job.state !== "delivered" && (
                    <div className="flex flex-wrap gap-2 border-t border-line/70 pt-3">
                      <a
                        href={`tel:${job.riderPhone}`}
                        className="inline-flex items-center gap-1.5 rounded-full border border-line px-3.5 py-1.5 text-xs font-semibold text-forest-900 hover:bg-ivory-100"
                      >
                        <IconPhone className="h-3.5 w-3.5" />
                        Call rider
                      </a>
                      <button
                        type="button"
                        disabled={busyId === job.id}
                        onClick={() => {
                          if (
                            window.confirm(
                              `Cancel this ${meta.label.toLowerCase()} assignment for ${job.riderName}?`,
                            )
                          ) {
                            void cancel(job.id);
                          }
                        }}
                        className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 px-3.5 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                      >
                        {busyId === job.id ? "Working…" : "Cancel"}
                      </button>
                      {job.state === "accepted" && (
                        <span className="ml-auto inline-flex items-center gap-1.5 text-[0.7rem] font-semibold text-emerald-700">
                          <IconCheck className="h-3.5 w-3.5" />
                          Rider is collecting
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
