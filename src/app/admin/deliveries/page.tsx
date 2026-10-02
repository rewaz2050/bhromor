"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useAdminDeliveries } from "@/lib/use-admin-deliveries";
import { RIDERS_POLL_MS, useRiders } from "@/lib/use-riders";
import { useOrders } from "@/lib/use-orders";
import { formatBdt } from "@/lib/format";
import { cashToCollect, paymentSummary } from "@/lib/payment-labels";
import { friendlyWhen } from "@/components/admin/order-ui";
import { PaymentChip } from "@/components/admin/payment-chip";
import { IconBox, IconTruck, IconPhone, IconCheck } from "@/components/ui/icons";
import AdminLiveMap from "@/components/admin/admin-live-map";
import { AdminSlaAlerts } from "@/components/admin/admin-sla-alerts";
import { AdminBatchAssign } from "@/components/admin/admin-batch-assign";
import { coverageSummary, diagnoseCoverage, type Coverage } from "@/lib/dispatch-coverage";

const STATE_META: Record<string, { label: string; cls: string }> = {
  offered: { label: "Offered", cls: "bg-amber-100 text-amber-900" },
  accepted: { label: "Accepted", cls: "bg-forest-100 text-forest-800" },
  picked_up: { label: "Picked up", cls: "bg-sky-100 text-sky-800" },
  delivered: { label: "Delivered", cls: "bg-emerald-100 text-emerald-800" },
  cancelled: { label: "Cancelled", cls: "bg-rose-100 text-rose-800" },
  expired: { label: "Expired", cls: "bg-ivory-200 text-ink-soft" },
  failed: { label: "Failed", cls: "bg-rose-200 text-rose-900" },
};

export default function AdminDeliveriesPage() {
  const {
    deliveries,
    awaitingOrders,
    failedDeliveries,
    resolveFailed,
    release,
    loading,
    error,
    clearError,
    busyId,
    offer,
    cancel,
    refresh,
  } = useAdminDeliveries();
  const { riders, dispatch, loading: ridersLoading } = useRiders(RIDERS_POLL_MS);
  const { orders } = useOrders();

  const counts = useMemo(() => {
    const out: Record<string, number> = {
      all: deliveries.length,
      offered: 0,
      accepted: 0,
      picked_up: 0,
      delivered: 0,
      cancelled: 0,
      expired: 0,
      failed: 0,
    };
    for (const d of deliveries) out[d.state] = (out[d.state] ?? 0) + 1;
    return out;
  }, [deliveries]);

  // S: why each waiting order has (or has not) offers — the silent no-coverage case.
  const coverage = useMemo(() => {
    const map = new Map<string, Coverage>();
    // An empty roster while it is still loading would shout "no rider covers…" for nothing.
    if (ridersLoading) return map;
    for (const order of awaitingOrders) {
      map.set(
        order.id,
        diagnoseCoverage(order, riders, {
          cashCap: dispatch.cashCap,
          loadLimit: dispatch.loadLimit,
          awaitingVerification: paymentSummary(order).awaitingVerification,
          // the awaiting list only holds orders with no live assignment
          hasLiveAssignment: false,
        }),
      );
    }
    return map;
  }, [awaitingOrders, riders, dispatch.cashCap, dispatch.loadLimit, ridersLoading]);
  const coverageCounts = useMemo(() => coverageSummary([...coverage.values()]), [coverage]);

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
            all eligible online riders in the delivery area. First acceptance wins.
            Use manual dispatch only when help is needed; accepted trips are not reassigned.
          </p>
        </div>
      </div>

      {error && (
        <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800 ring-1 ring-rose-200">
          {error}{" "}
          <button type="button" onClick={clearError} className="underline underline-offset-2">
            Dismiss
          </button>
        </p>
      )}

      {coverageCounts.alert > 0 && (
        <p
          role="alert"
          data-testid="coverage-alert"
          className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-900 ring-1 ring-rose-300"
        >
          ⚠ {coverageCounts.alert} waiting order{coverageCounts.alert === 1 ? " has" : "s have"} no rider who can take {coverageCounts.alert === 1 ? "it" : "them"} — see “Awaiting dispatch” below for the reason and the fix.
        </p>
      )}
      <p className="rounded-xl bg-sky-50 p-4 text-sm text-sky-900">
        {new Set(deliveries.filter(d => d.state === "offered").map(d => d.orderId)).size} orders requesting riders · {counts.offered} invitations.
        One order can have several invitations, but only one assigned rider.
      </p>
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

      {/* SLA Alerts + Live Dispatch Map - Serial 3-6 */}
      <section className="rounded-2xl bg-paper p-5 ring-1 ring-line space-y-4">
        <h3 className="font-display text-base font-semibold text-forest-900">🗺️ Area requests · Live deliveries</h3>
        <AdminSlaAlerts orders={orders} />
        <AdminLiveMap
          riders={riders}
          orders={[...new Map(awaitingOrders.concat(deliveries.map((d) => d.order)).map(o => [o.id, o])).values()]}
          deliveries={deliveries.filter(d => ["accepted", "picked_up", "delivered"].includes(d.state)).map((d) => ({ orderId: d.orderId, riderId: d.riderId, state: d.state }))}
        />
        <p className="text-xs text-ink-soft">
          Ready orders send {dispatch.offerTtl}-second requests to eligible riders in the delivery zone. The first rider to accept gets the job. Invitations are not assignments. Riders carry at most {dispatch.loadLimit} active orders; riders at the {formatBdt(dispatch.cashCap)} cash limit cannot accept more (change in Riders → Dispatch rules). Customer pickups never enter dispatch.
        </p>
      </section>

      <AdminBatchAssign cashLimit={dispatch.cashCap} loadLimit={dispatch.loadLimit} riders={riders} orders={orders} onAssigned={() => { void refresh(); }} />

      {failedDeliveries.length > 0 && (
        <section aria-label="Failed deliveries">
          <div className="mb-3 flex items-center gap-2">
            <IconTruck className="h-4 w-4 text-rose-700" />
            <h3 className="font-display text-base font-semibold text-rose-900">
              Failed deliveries — needs action ({failedDeliveries.length})
            </h3>
          </div>
          <p className="mb-3 text-xs leading-5 text-ink-soft">
            The rider used every delivery attempt and is bringing the parcel back to the
            shop. <strong>Redispatch</strong> once the shop has it (or the customer is
            reachable again) to offer it to the area; <strong>Cancel</strong> if the order
            is dead. A prepaid order must be refunded offline.
          </p>
          <div className="space-y-3">
            {failedDeliveries.map((f) => (
              <div
                key={f.order.id}
                className="space-y-3 rounded-2xl bg-rose-50 p-4 ring-1 ring-rose-200"
              >
                <div className="flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/admin/orders/${f.order.id}`}
                      className="font-mono text-xs font-bold text-forest-900 hover:underline"
                    >
                      #{f.order.id}
                    </Link>
                    <p className="mt-1 text-xs text-ink-soft">
                      {f.order.customer.name} · {f.order.customer.phone} ·{" "}
                      {f.order.zoneName} · {friendlyWhen(f.failedAt)}
                    </p>
                    <p className="mt-1 text-xs font-semibold text-rose-900">
                      {f.attempts} failed attempt{f.attempts === 1 ? "" : "s"}
                      {f.reason ? ` — “${f.reason}”` : ""}
                      {f.riderName ? ` · rider ${f.riderName}` : ""}
                    </p>
                  </div>
                  <span className="text-right text-sm font-bold text-forest-900">
                    {formatBdt(f.order.total)}
                    <span className="block text-[0.65rem] font-semibold text-ink-soft">
                      <PaymentChip order={f.order} className="normal-case tracking-normal" />
                    </span>
                  </span>
                </div>
                <div className="flex flex-wrap gap-2 border-t border-rose-200 pt-3">
                  {f.order.customer.phone && (
                    <a
                      href={`tel:${f.order.customer.phone}`}
                      className="inline-flex items-center gap-1.5 rounded-full border border-line bg-paper px-3.5 py-1.5 text-xs font-semibold text-forest-900 hover:bg-ivory-100"
                    >
                      <IconPhone className="h-3.5 w-3.5" />
                      Call customer
                    </a>
                  )}
                  {f.riderPhone && (
                    <a
                      href={`tel:${f.riderPhone}`}
                      className="inline-flex items-center gap-1.5 rounded-full border border-line bg-paper px-3.5 py-1.5 text-xs font-semibold text-forest-900 hover:bg-ivory-100"
                    >
                      <IconPhone className="h-3.5 w-3.5" />
                      Call rider
                    </a>
                  )}
                  <button
                    type="button"
                    disabled={busyId === f.order.id}
                    onClick={() => {
                      if (
                        window.confirm(
                          `Send #${f.order.id} back to the area queue? Do this once the shop has the parcel again.`,
                        )
                      ) {
                        void resolveFailed(f.order.id, "redispatch");
                      }
                    }}
                    className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-forest-800 px-4 py-1.5 text-xs font-semibold text-ivory-50 hover:bg-forest-900 disabled:opacity-50"
                  >
                    <IconTruck className="h-3.5 w-3.5" />
                    {busyId === f.order.id ? "Working…" : "Redispatch"}
                  </button>
                  <button
                    type="button"
                    disabled={busyId === f.order.id}
                    onClick={() => {
                      const note = window.prompt(
                        `Why is #${f.order.id} being cancelled? (shown in the order history)`,
                        f.reason,
                      );
                      if (note && note.trim().length >= 3) {
                        void resolveFailed(f.order.id, "cancel", note.trim());
                      }
                    }}
                    className="inline-flex items-center gap-1.5 rounded-full border border-rose-300 px-4 py-1.5 text-xs font-semibold text-rose-800 hover:bg-rose-100 disabled:opacity-50"
                  >
                    Cancel order
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

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
                    {order.isReturn ? " · ↩ return pickup" : ""}
                    {" · "}
                    <PaymentChip order={order} className="normal-case tracking-normal" />
                    {" · "}
                    {cashToCollect(order) > 0
                      ? `rider collects ${formatBdt(cashToCollect(order))}`
                      : "no cash to collect"}
                  </p>
                  {coverage.get(order.id) && (
                    <p
                      data-testid="coverage-line"
                      data-reason={coverage.get(order.id)!.reason}
                      className={`mt-1 text-xs font-semibold ${
                        coverage.get(order.id)!.severity === "alert"
                          ? "text-rose-800"
                          : coverage.get(order.id)!.severity === "warn"
                            ? "text-amber-800"
                            : "text-ink-soft"
                      }`}
                    >
                      {coverage.get(order.id)!.severity === "alert" ? "⚠ " : ""}
                      {coverage.get(order.id)!.label}
                      {coverage.get(order.id)!.waitingMin > 0 ? ` · waiting ${coverage.get(order.id)!.waitingMin} min` : ""}
                      <span className="block font-normal text-ink-soft">→ {coverage.get(order.id)!.action}</span>
                    </p>
                  )}
                </div>
                <Link
                  href={`/admin/orders/${order.id}`}
                  className="rounded-full px-3 py-1.5 text-xs font-semibold text-forest-800 ring-1 ring-forest-300 hover:bg-forest-50"
                >
                  Open order
                </Link>
                {paymentSummary(order).awaitingVerification ? (
                  <Link
                    href={`/admin/orders/${order.id}`}
                    className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-4 py-1.5 text-xs font-semibold text-amber-900 ring-1 ring-amber-300 hover:bg-amber-200"
                  >
                    Verify payment first
                  </Link>
                ) : (
                  <button
                    type="button"
                    disabled={busyId === order.id}
                    onClick={() => void offer(order.id)}
                    className="inline-flex items-center gap-1.5 rounded-full bg-forest-800 px-4 py-1.5 text-xs font-semibold text-ivory-50 hover:bg-forest-900 disabled:opacity-50"
                  >
                    <IconTruck className="h-3.5 w-3.5" />
                    {busyId === order.id ? "Offering…" : "Send area requests"}
                  </button>
                )}
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
                    <span className="text-right text-sm font-bold text-forest-900">
                      {formatBdt(job.order.total)}
                      <span className="block text-[0.65rem] font-semibold text-ink-soft">
                        {cashToCollect(job.order) > 0
                          ? `COD · rider collects`
                          : job.order.isReturn
                            ? "return · no cash"
                            : "prepaid · no cash"}
                      </span>
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
                      {job.state === "offered" && <button
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
                      </button>}
                      {(job.state === "accepted" || job.state === "picked_up") && (
                        <button
                          type="button"
                          disabled={busyId === job.id}
                          onClick={() => {
                            const reason = window.prompt(
                              job.state === "accepted"
                                ? `Release ${job.riderName}? The order goes back to the area queue. Reason:`
                                : `Release ${job.riderName} while carrying the parcel? It moves to Failed deliveries for you to redispatch or cancel. Reason:`,
                              "rider unreachable",
                            );
                            if (reason && reason.trim().length >= 5) {
                              void release(job.id, reason.trim());
                            }
                          }}
                          className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 px-3.5 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                        >
                          {busyId === job.id ? "Working…" : "Release rider"}
                        </button>
                      )}
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
