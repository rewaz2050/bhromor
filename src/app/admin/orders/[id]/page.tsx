"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useOrder } from "@/lib/use-orders";
import {
  ACTION_LABEL,
  PUBLIC_STEPS,
  STATUS_META,
  canCancel,
  flowIndex,
  getDeliveryCode,
  normalizePhone,
  nextActions,
  publicPhase,
  publicStepDone,
  type OrderStatus,
} from "@/lib/orders";
import { formatBdt } from "@/lib/format";
import { deliverySlotLabel, deliverySlotSummary } from "@/lib/delivery-slots";
import { paymentSummary } from "@/lib/payment-labels";
import { PICKUP_HANDOVER_LABEL, PICKUP_HANDOVER_NOTE } from "@/lib/order-actions";
import {
  DOT,
  StatusBadge,
  clockTime,
  friendlyWhen,
} from "@/components/admin/order-ui";
import { IconArrowRight, IconClock, IconShield } from "@/components/ui/icons";
import WarrantyClaimsCard from "@/components/admin/warranty-claims-card";
import OrderWhatsAppStatus from "@/components/admin/order-whatsapp-status";
import WaDraftPanel from "@/components/admin/wa-draft-panel";
import PaymentCard from "@/components/admin/payment-card";

const RETURN_STATUS_LABEL: Record<string, string> = {
  requested: "Requested — awaiting decision",
  approved: "Approved — awaiting rider dispatch",
  picked_up: "Picked up from the customer",
  refunded: "Received by the shop (leg complete)",
  rejected: "Rejected by the shop",
};

export default function AdminOrderDetailPage() {
  const params = useParams<{ id: string }>();
  // Served from the loaded list, or fetched by order number when the order
  // is older than the loaded pages (the list is paginated).
  const { order, loading, error, clearError, advance, cancel, refresh } =
    useOrder(params.id);
  // Hooks first, before any early return below.
  const [returnBusy, setReturnBusy] = useState<
    null | "approve" | "reject" | "complete"
  >(null);
  const [returnError, setReturnError] = useState<string | null>(null);
  // Two-tap flow: "Start preparing" is an optional extra step, tucked away.
  const [showAdvanced, setShowAdvanced] = useState(false);

  if (loading) {
    return (
      <div className="space-y-6" role="status" aria-label="Loading order">
        <div className="h-8 w-64 animate-pulse rounded-lg bg-ivory-200" />
        <div className="h-40 animate-pulse rounded-2xl bg-paper ring-1 ring-line" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="rounded-2xl bg-paper py-20 text-center ring-1 ring-line">
        <p className="font-display text-lg text-forest-900">Order not found</p>
        <p className="mt-1 text-sm text-ink-soft">
          It may have been deleted, or belong to a different dataset.
        </p>
        <Link
          href="/admin/orders"
          className="mt-6 inline-flex items-center gap-2 rounded-full bg-forest-800 px-6 py-2.5 text-sm font-medium text-ivory-50 hover:bg-forest-700"
        >
          Back to orders
        </Link>
      </div>
    );
  }

  const doReturnAction = async (
    action: "approve" | "reject" | "complete",
  ) => {
    let note = "";
    if (action === "reject") {
      const prompted = window.prompt(
        "Reason for the customer (optional but kind):",
      );
      if (prompted === null) return; // dismissed
      note = prompted.trim();
    }
    if (
      action === "approve" &&
      !window.confirm(
        "Approve this return? It becomes ready for rider dispatch (Admin → Deliveries).",
      )
    ) {
      return;
    }
    setReturnBusy(action);
    setReturnError(null);
    try {
      const res = await fetch(
        `/api/admin/orders/${encodeURIComponent(order.id)}/return`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, note }),
        },
      );
      const data = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!res.ok) throw new Error(data?.error ?? "Action failed");
      await refresh();
    } catch (err) {
      setReturnError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setReturnBusy(null);
    }
  };

  // Two-tap flow (2026-09-17): Confirm → Ready — request riders. The primary
  // action is the first legal step; any other legal step (the optional
  // "Start preparing") sits behind an "Advanced" disclosure. Rider states
  // (courier-assigned → out-for-delivery → delivered) belong to the rider
  // app — the admin sees who has it, not a button.
  const steps = nextActions(order.status);
  const [primary, ...secondary] = steps;
  const riderOwned =
    order.status === "ready-for-pickup" ||
    order.status === "courier-assigned" ||
    order.status === "out-for-delivery";
  const cancellable = canCancel(order.status);
  const flowPos = flowIndex(order.status);
  const isCancelled = order.status === "cancelled";
  const phase = publicPhase(order.status);
  const pay = paymentSummary(order);
  // A counter pickup never meets a rider: once it is ready, the shop closes
  // it when the customer collects (the server walks the rider states).
  const pickupHandover = riderOwned && order.isPickup && !order.isReturn;

  const doAdvance = (to: OrderStatus, note?: string) => {
    if (to === "cancelled") {
      if (!window.confirm("Cancel this order? Reserved stock is released.")) return;
      void cancel(order.id);
      return;
    }
    void advance(order.id, to, note);
  };

  return (
    <div className="space-y-6">
      {error && (
        <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800 ring-1 ring-rose-200">
          {error}{" "}
          <button
            type="button"
            onClick={clearError}
            className="underline underline-offset-2"
          >
            Dismiss
          </button>
        </p>
      )}
      {/* Header */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Link
          href="/admin/orders"
          className="text-sm text-ink-soft transition-colors hover:text-forest-800"
        >
          ← Orders
        </Link>
        <h2 className="font-mono text-lg font-semibold text-forest-900">
          {order.id}
        </h2>
        <StatusBadge status={order.status} />
        <span className="ml-auto text-sm text-ink-soft">
          Placed {friendlyWhen(order.createdAt)}
        </span>
      </div>

      {/* Actions — only legal transitions are offered (§34) + free print invoice.
          Return orders move only through the return actions below — approving
          one IS its dispatch hand-off, so the normal flow stays out. */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-paper p-4 ring-1 ring-line">
        {!order.isReturn && (steps.length > 0 || cancellable) && (
          <>
            {primary && !riderOwned && (
              <button
                type="button"
                onClick={() => doAdvance(primary)}
                className="inline-flex items-center gap-2 rounded-full bg-forest-800 px-5 py-2.5 text-sm font-semibold text-ivory-50 transition-colors hover:bg-forest-700"
              >
                {ACTION_LABEL[primary as Exclude<OrderStatus, "pending">]}
                <IconArrowRight className="h-4 w-4" />
              </button>
            )}
            {primary && !riderOwned && secondary.length > 0 && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowAdvanced((v) => !v)}
                  aria-expanded={showAdvanced}
                  className="rounded-full px-4 py-2.5 text-sm font-medium text-ink-soft ring-1 ring-line transition-colors hover:text-forest-800"
                >
                  {showAdvanced ? "Hide" : "More…"}
                </button>
                {showAdvanced && (
                  <div className="absolute left-0 top-full z-10 mt-2 w-64 rounded-2xl bg-paper p-2 shadow-lg ring-1 ring-line">
                    {secondary.map((to) => (
                      <button
                        key={to}
                        type="button"
                        onClick={() => {
                          setShowAdvanced(false);
                          doAdvance(to);
                        }}
                        className="block w-full rounded-xl px-3 py-2 text-left text-sm text-ink hover:bg-ivory-100"
                      >
                        {ACTION_LABEL[to as Exclude<OrderStatus, "pending">]}
                        <span className="block text-xs text-ink-soft">
                          Optional step — packing takes a while, and you want the
                          customer to see it.
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {cancellable && (
              <button
                type="button"
                onClick={() => doAdvance("cancelled")}
                className="rounded-full px-5 py-2.5 text-sm font-semibold text-rose-700 ring-1 ring-rose-300 transition-colors hover:bg-rose-50"
              >
                Cancel order
              </button>
            )}
          </>
        )}
        {pickupHandover && (
          <>
            <button
              type="button"
              onClick={() => {
                if (!window.confirm(`Customer collected order ${order.id} at Traffic Point?`)) return;
                doAdvance("delivered", PICKUP_HANDOVER_NOTE);
              }}
              className="inline-flex items-center gap-2 rounded-full bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-600"
            >
              {PICKUP_HANDOVER_LABEL}
              <IconArrowRight className="h-4 w-4" />
            </button>
            <p className="text-sm text-ink-soft">
              Counter pickup — no rider. Check the customer&apos;s PIN{" "}
              <span className="font-mono font-semibold text-forest-900">
                {order.deliveryCode ?? getDeliveryCode(order.id)}
              </span>{" "}
              and hand the parcel over.
            </p>
          </>
        )}
        {!order.isReturn && riderOwned && !pickupHandover && (
          <p className="text-sm text-ink-soft">
            {order.status === "ready-for-pickup" && !order.rider
              ? "Waiting for a rider — the nearest online rider has been offered this order. Manual assign: Admin → Deliveries."
              : order.status === "out-for-delivery"
                ? `Picked up — ${order.rider?.name ?? "the rider"} is on the way. The rider marks Delivered with the customer's 4-digit code.`
                : `${order.rider?.name ?? "A rider"} accepted and is heading to the shop. The rider taps Pickup, then Delivered.`}
          </p>
        )}
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-full bg-paper px-5 py-2.5 text-sm font-semibold ring-1 ring-line hover:bg-ivory-100"
        >
          🖨️ Print invoice
        </button>
        <OrderWhatsAppStatus order={order} />
      </div>

      {/* The free fallback (2026-09-24): when the shopper's phone could not be
          pushed (no opt-in / dead device), the step is waiting here as a
          WhatsApp draft — one tap opens the shop's own app prefilled. */}
      <WaDraftPanel orderNo={order.id} status={order.status} />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Items + totals */}
        <section
          aria-label="Ordered items"
          className="rounded-2xl bg-paper p-6 ring-1 ring-line lg:col-span-2"
        >
          <h3 className="text-[0.7rem] font-semibold uppercase tracking-[0.2em] text-ink-soft">
            Items · snapshot at purchase (§75)
          </h3>
          <ul className="mt-4 divide-y divide-line">
            {order.items.map((it, i) => (
              <li key={i} className="flex items-center gap-4 py-4">
                <Image
                  src={it.image}
                  alt=""
                  width={56}
                  height={56}
                  className="h-14 w-14 rounded-xl object-cover"
                />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-ink">{it.name}</p>
                  <p className="mt-0.5 text-xs text-ink-soft">
                    {it.variant} · {it.sku} · {formatBdt(it.unitPrice)} each
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-medium text-ink">
                    {formatBdt(it.unitPrice * it.qty)}
                  </p>
                  <p className="text-xs text-ink-soft">× {it.qty}</p>
                </div>
              </li>
            ))}
          </ul>

          <dl className="mt-4 space-y-2 border-t border-line pt-4 text-sm">
            <div className="flex justify-between text-ink-soft">
              <dt>Subtotal</dt>
              <dd>{formatBdt(order.subtotal)}</dd>
            </div>
            <div className="flex justify-between text-ink-soft">
              <dt>
                Delivery · {order.etaLabel}
                {order.isPickup ? " — PICKUP" : ""}
                {order.isExpress ? " — Express" : ""}
              </dt>
              <dd>{formatBdt(order.deliveryCharge)}</dd>
            </div>
            {deliverySlotSummary(order) && (
              <div className="flex justify-between rounded bg-sky-50 px-2 py-1 text-sky-800" data-testid="admin-slot">
                <dt>🕒 Slot: {deliverySlotSummary(order)}</dt>
                <dd>{order.isExpress ? "+Express" : ""}</dd>
              </div>
            )}
            {((order.surchargeNight ?? 0) > 0 || (order.surchargeRain ?? 0) > 0 || (order.surchargeDistance ?? 0) > 0 || (order.surchargeExpress ?? 0) > 0 || (order.surchargeWeight ?? 0) > 0) && (
              <div className="rounded-xl bg-amber-50 p-2 ring-1 ring-amber-200 text-xs space-y-1">
                <p className="font-bold text-amber-900">Surcharges breakdown</p>
                {(order.surchargeNight ?? 0) > 0 && <div className="flex justify-between"><span>Night (9PM-6AM)</span><span>{formatBdt(order.surchargeNight ?? 0)}</span></div>}
                {(order.surchargeRain ?? 0) > 0 && <div className="flex justify-between"><span>Rain</span><span>{formatBdt(order.surchargeRain ?? 0)}</span></div>}
                {(order.surchargeDistance ?? 0) > 0 && <div className="flex justify-between"><span>Distance &gt;4km</span><span>{formatBdt(order.surchargeDistance ?? 0)}</span></div>}
                {(order.surchargeExpress ?? 0) > 0 && <div className="flex justify-between"><span>Express</span><span>{formatBdt(order.surchargeExpress ?? 0)}</span></div>}
                {(order.surchargeWeight ?? 0) > 0 && <div className="flex justify-between"><span>Weight &gt;5kg</span><span>{formatBdt(order.surchargeWeight ?? 0)}</span></div>}
              </div>
            )}
            {(order.tipAmount ?? 0) > 0 && (
              <div className="flex justify-between text-forest-700">
                <dt>💝 Tip for Rider</dt>
                <dd>+{formatBdt(order.tipAmount ?? 0)}</dd>
              </div>
            )}
            {order.weightKg && (
              <div className="flex justify-between text-ink-soft text-xs">
                <dt>Approx weight</dt>
                <dd>{order.weightKg} kg</dd>
              </div>
            )}
            {order.coupon && (
              <div className="flex justify-between text-emerald-700">
                <dt>Coupon · {order.coupon.code}</dt>
                <dd>−{formatBdt(order.coupon.discount)}</dd>
              </div>
            )}
            <div className="flex justify-between border-t border-line pt-3 text-base font-semibold text-forest-900">
              <dt>
                Total · {pay.short}
                {order.isPickup ? " · counter pickup" : ""}
              </dt>
              <dd>{formatBdt(order.total)}</dd>
            </div>
            <p className="text-xs text-ink-soft">
              {order.isReturn
                ? "Return leg — the rider collects goods, not money."
                : pay.prepaid
                  ? `${pay.label} — the rider collects nothing at the door.`
                  : order.isPickup
                    ? "Cash at the counter when the customer collects."
                    : `Cash on delivery — the rider collects ${formatBdt(order.total)}.`}
            </p>
          </dl>
        </section>

        <div className="space-y-6">
          {/* Customer */}
          <section
            aria-label="Customer and delivery"
            className="rounded-2xl bg-paper p-6 ring-1 ring-line"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-[0.7rem] font-semibold uppercase tracking-[0.2em] text-ink-soft">
                Customer & delivery
              </h3>
              <span className="flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold font-mono text-emerald-800">
                <IconShield className="h-3 w-3" /> PIN: {order.deliveryCode ?? getDeliveryCode(order.id)}
              </span>
            </div>
            <dl className="mt-4 space-y-3 text-sm">
              <div>
                <dt className="text-xs text-ink-soft">Name</dt>
                <dd className="font-medium text-ink">{order.customer.name}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-soft">Phone</dt>
                <dd className="font-medium text-ink flex flex-wrap gap-2 items-center">
                  <a
                    href={`tel:+88${normalizePhone(order.customer.phone)}`}
                    className="text-forest-800 underline underline-offset-4 hover:text-forest-600"
                  >
                    {order.customer.phone}
                  </a>
                  <a
                    href={`https://wa.me/88${normalizePhone(order.customer.phone)}?text=${encodeURIComponent(`Assalamualaikum! PROSANTI order ${order.id} — ${order.status}. Traffic Point, Sunamganj Sadar. Track: ${typeof window !== "undefined" ? window.location.origin : ""}/track`)}`}
                    target="_blank"
                    className="rounded-full bg-[#25D366] px-3 py-1 text-xs font-semibold text-white"
                  >
                    WhatsApp
                  </a>
                </dd>
              </div>
              <div>
                <dt className="text-xs text-ink-soft">Area</dt>
                <dd className="font-medium text-ink">{order.customer.area}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-soft">Address</dt>
                <dd className="leading-6 text-ink">
                  {order.customer.address ?? "—"}
                </dd>
              </div>
              {order.customer.note && (
                <div>
                  <dt className="text-xs text-ink-soft">Order note</dt>
                  <dd className="italic leading-6 text-ink">“{order.customer.note}”</dd>
                </div>
              )}
              <div className="flex items-center gap-2 border-t border-line pt-3 text-xs text-ink-soft">
                <IconClock className="h-3.5 w-3.5" />
                Zone: {order.zoneName}
              </div>
              {order.lat && order.lng && (
                <div className="mt-3 rounded-xl bg-ivory-100 p-3 ring-1 ring-line">
                  <p className="text-[0.7rem] font-bold uppercase tracking-wider text-ink-soft">Map Pin — Geo</p>
                  <p className="mt-1 text-xs font-mono">Lat: {order.lat.toFixed(5)}, Lng: {order.lng.toFixed(5)}</p>
                  {order.distanceKm !== undefined && <p className="text-xs">Distance from Hub: {order.distanceKm.toFixed(2)} km</p>}
                  <a
                    href={`https://www.openstreetmap.org/?mlat=${order.lat}&mlon=${order.lng}#map=16/${order.lat}/${order.lng}`}
                    target="_blank"
                    className="mt-2 inline-block rounded-full bg-forest-800 px-3 py-1 text-xs font-semibold text-white"
                  >
                    Open in OSM
                  </a>
                  <a
                    href={`https://www.google.com/maps?q=${order.lat},${order.lng}`}
                    target="_blank"
                    className="ml-2 inline-block rounded-full bg-paper px-3 py-1 text-xs ring-1 ring-line"
                  >
                    Google Maps
                  </a>
                </div>
              )}
              {order.deliveryProofUrl && (
                <div className="mt-3 rounded-xl bg-emerald-50 p-3 ring-1 ring-emerald-200">
                  <p className="text-[0.7rem] font-bold uppercase tracking-wider text-emerald-800">Delivery Proof — Cloudinary</p>
                  <div className="relative mt-2 h-64 w-full overflow-hidden rounded-xl">
                    <Image
                      src={order.deliveryProofUrl}
                      alt="Delivery proof photo"
                      fill
                      sizes="(min-width: 1024px) 40vw, 100vw"
                      className="object-cover"
                    />
                  </div>
                  <p className="mt-1 text-[10px] break-all text-ink-soft">{order.deliveryProofUrl}</p>
                </div>
              )}
              {order.deliveryFailedReason && (
                <div className="mt-3 rounded-xl bg-rose-50 p-3 ring-1 ring-rose-200">
                  <p className="text-xs font-bold text-rose-800">Failed attempt: {order.deliveryFailedReason}</p>
                  <p className="text-xs">Attempts: {order.deliveryAttempts}</p>
                </div>
              )}
              {order.isReturn && (
                <div className="mt-3 rounded-xl bg-amber-50 p-3 ring-1 ring-amber-200">
                  <p className="text-[0.7rem] font-bold uppercase tracking-wider text-amber-900">
                    Return / Exchange — home pickup
                  </p>
                  {order.returnParentOrderNo && (
                    <p className="mt-1 text-xs">
                      Parent:{" "}
                      <Link
                        href={`/admin/orders/${order.returnParentOrderNo}`}
                        className="font-mono font-semibold text-forest-800 underline underline-offset-2"
                      >
                        {order.returnParentOrderNo}
                      </Link>
                    </p>
                  )}
                  {order.returnReason && (
                    <p className="mt-1 text-xs leading-5">
                      <span className="font-semibold">Reason:</span>{" "}
                      {order.returnReason}
                    </p>
                  )}
                  {order.returnStatus && (
                    <p className="mt-1 text-xs">
                      <span className="font-semibold">Return status:</span>{" "}
                      {RETURN_STATUS_LABEL[order.returnStatus] ?? order.returnStatus}
                    </p>
                  )}
                  {(order.returnStatus === "requested" ||
                    order.returnStatus === "approved" ||
                    order.returnStatus === "picked_up") && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {order.returnStatus === "requested" && (
                        <>
                          <button
                            type="button"
                            disabled={returnBusy !== null}
                            onClick={() => void doReturnAction("approve")}
                            className="rounded-full bg-emerald-700 px-3.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-600 disabled:opacity-60"
                          >
                            {returnBusy === "approve" ? "Approving…" : "Approve pickup"}
                          </button>
                          <button
                            type="button"
                            disabled={returnBusy !== null}
                            onClick={() => void doReturnAction("reject")}
                            className="rounded-full bg-paper px-3.5 py-1.5 text-xs font-semibold text-rose-700 ring-1 ring-rose-300 transition-colors hover:bg-rose-50 disabled:opacity-60"
                          >
                            {returnBusy === "reject" ? "Rejecting…" : "Reject"}
                          </button>
                        </>
                      )}
                      {order.returnStatus !== "requested" && (
                        <button
                          type="button"
                          disabled={returnBusy !== null}
                          onClick={() => void doReturnAction("complete")}
                          className="rounded-full bg-forest-800 px-3.5 py-1.5 text-xs font-semibold text-ivory-50 transition-colors hover:bg-forest-700 disabled:opacity-60"
                        >
                          {returnBusy === "complete"
                            ? "Completing…"
                            : "Mark received & complete"}
                        </button>
                      )}
                    </div>
                  )}
                  {returnError && (
                    <p role="alert" className="mt-2 text-xs font-medium text-rose-800">
                      {returnError}
                    </p>
                  )}
                </div>
              )}
              {!order.isReturn && order.returnChild && (
                <div className="mt-3 rounded-xl bg-sky-50 p-3 ring-1 ring-sky-200">
                  <p className="text-[0.7rem] font-bold uppercase tracking-wider text-sky-900">
                    Return / exchange on this order
                  </p>
                  <p className="mt-1 text-xs leading-5">
                    {RETURN_STATUS_LABEL[order.returnChild.returnStatus] ??
                      order.returnChild.returnStatus}{" "}
                    · leg order{" "}
                    <Link
                      href={`/admin/orders/${order.returnChild.orderNo}`}
                      className="font-mono font-semibold text-forest-800 underline underline-offset-2"
                    >
                      {order.returnChild.orderNo}
                    </Link>
                  </p>
                </div>
              )}
              {order.isPickup && (
                <div className="mt-3 rounded-xl bg-sky-50 p-3 ring-1 ring-sky-200">
                  <p className="text-[0.7rem] font-bold uppercase tracking-wider text-sky-900">Store Pickup — Traffic Point</p>
                  <p className="text-xs">Pickup Slot: {deliverySlotLabel(order.pickupSlot || order.deliveryWindow || "now") ?? "now"}</p>
                  <p className="text-xs">Ready in ~{order.etaLabel}</p>
                </div>
              )}
              {!order.isPickup && deliverySlotSummary(order) && (
                <div className="mt-3 rounded-xl bg-sky-50 p-3 ring-1 ring-sky-200">
                  <p className="text-[0.7rem] font-bold uppercase tracking-wider text-sky-900">🕒 Customer asked for a delivery slot</p>
                  <p className="mt-1 text-sm font-semibold text-sky-900">{deliverySlotSummary(order)}</p>
                  <p className="text-xs text-sky-800">Pack in time and hand to a rider before the window starts.</p>
                </div>
              )}
              {/* P1 #8: bKash/Nagad wallet payment — verify or reject */}
              <PaymentCard
                orderNo={order.id}
                payment={order.payment}
                paymentRef={order.paymentRef}
                paymentStatus={order.paymentStatus}
                paymentVerifiedAt={order.paymentVerifiedAt}
                total={order.total}
                customerPhone={order.customer.phone}
                orderStatus={order.status}
                onDecided={refresh}
              />
            </dl>
          </section>

          {/* Status rail */}
          <section
            aria-label="Status timeline"
            className="rounded-2xl bg-paper p-6 ring-1 ring-line"
          >
            <h3 className="text-[0.7rem] font-semibold uppercase tracking-[0.2em] text-ink-soft">
              Journey
            </h3>
            <ol className="mt-5">
              {/* Four public milestones (what the customer sees on /track);
                  the internal states reached inside each one are listed
                  underneath with their timestamps, so nothing is hidden. */}
              {PUBLIC_STEPS.map((step, i) => {
                const done = publicStepDone(order.status, i);
                const isCurrent =
                  !isCancelled && phase === i && order.status !== "delivered";
                const last = i === PUBLIC_STEPS.length - 1;
                const reachedStatuses = (step.statuses as readonly OrderStatus[]).filter(
                  (st) => !isCancelled && flowPos >= flowIndex(st),
                );
                const dotStatus =
                  reachedStatuses[reachedStatuses.length - 1] ?? step.statuses[0];
                return (
                  <li key={step.key} className="relative flex gap-4 pb-6 last:pb-0">
                    {!last && (
                      <span
                        aria-hidden
                        className={`absolute left-[9px] top-6 h-full w-px ${
                          done && !isCancelled ? "bg-forest-300" : "bg-line"
                        }`}
                      />
                    )}
                    <span
                      aria-hidden
                      className={`mt-0.5 flex h-[19px] w-[19px] shrink-0 items-center justify-center rounded-full ring-4 ring-paper ${
                        done || isCurrent ? DOT[dotStatus] : "bg-ivory-200"
                      } ${isCurrent ? "shadow-[0_0_0_2px_#1b3a2d]" : ""}`}
                    />
                    <div className="min-w-0">
                      <p
                        className={`text-sm font-medium ${
                          done || isCurrent ? "text-ink" : "text-ink-soft/70"
                        }`}
                      >
                        {step.label}
                        {isCurrent && (
                          <span className="ml-2 rounded-full bg-gold-100 px-2 py-0.5 text-[0.62rem] font-bold uppercase tracking-wide text-gold-700">
                            Now
                          </span>
                        )}
                      </p>
                      {reachedStatuses.map((st) => {
                        const entry = order.timeline.find((t) => t.status === st);
                        const isNow = st === order.status;
                        // A milestone reached in one internal step needs no
                        // repeated label — just its time.
                        const soleStep = reachedStatuses.length === 1 && st === step.doneAt;
                        const parts = [
                          soleStep ? "" : STATUS_META[st].label,
                          entry ? clockTime(entry.at) : "",
                          entry?.note ?? "",
                        ].filter(Boolean);
                        if (parts.length === 0) return null;
                        return (
                          <p
                            key={st}
                            className={`mt-0.5 text-xs ${isNow ? "font-medium text-ink" : "text-ink-soft"}`}
                          >
                            {parts.join(" · ")}
                          </p>
                        );
                      })}
                    </div>
                  </li>
                );
              })}
              {isCancelled && (
                <li className="relative flex gap-4 pt-4">
                  <span className="mt-0.5 flex h-[19px] w-[19px] shrink-0 items-center justify-center rounded-full bg-rose-400 ring-4 ring-paper" />
                  <div>
                    <p className="text-sm font-medium text-rose-800">
                      Cancelled
                    </p>
                    <p className="mt-0.5 text-xs text-ink-soft">
                      {clockTime(order.timeline.at(-1)!.at)}
                      {order.timeline.at(-1)!.note ? ` · ${order.timeline.at(-1)!.note}` : ""}
                    </p>
                  </div>
                </li>
              )}
            </ol>
            {order.status === "delivered" && order.deliveredMinutes && (
              <p className="mt-5 rounded-xl bg-emerald-100 px-4 py-3 text-sm font-medium text-emerald-900">
                Delivered in {order.deliveredMinutes} min
              </p>
            )}
          </section>

          {/* P1 #14: warranty claims on this order (only when there are any) */}
          <WarrantyClaimsCard orderNo={order.id} />
        </div>
      </div>
    </div>
  );
}
