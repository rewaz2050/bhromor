"use client";

import React, { useState } from "react";
import Image from "next/image";
import { useLocalOrders } from "@/lib/use-orders";
import { isSupabaseConfigured } from "@/lib/env";
import {
  flowIndex,
  samePhone,
  type Order,
  type OrderStatus,
} from "@/lib/orders";
import { formatBdt } from "@/lib/format";
import { clockTime } from "@/components/admin/order-ui";
import {
  IconBox,
  IconCheck,
  IconMapPin,
  IconPhone,
  IconSearch,
  IconTruck,
} from "@/components/ui/icons";
import { LiveDeliveryMap } from "./live-delivery-map";
import { SignatureCanvas } from "./signature-canvas";
import { DeliveryRating } from "./delivery-rating";
import { RescheduleDelivery } from "./reschedule-delivery";
import { DeliveryFeeCalculator } from "@/components/delivery/delivery-fee-calculator";

/** Public-facing steps — “ready for pickup” folds into courier assignment. */
const STEPS: {
  statuses: OrderStatus[];
  label: string;
  note: string;
}[] = [
  {
    statuses: ["pending"],
    label: "Order Placed",
    note: "Confirmed receipt of your order",
  },
  {
    statuses: ["confirmed"],
    label: "Order Confirmed",
    note: "Stock reserved & payment method verified",
  },
  {
    statuses: ["preparing"],
    label: "Preparing",
    note: "Being quality-checked & packed",
  },
  {
    statuses: ["ready-for-pickup", "courier-assigned"],
    label: "Courier Assigned",
    note: "A rider is on the way to collect",
  },
  {
    statuses: ["out-for-delivery"],
    label: "Out for Delivery",
    note: "Your order is on the move",
  },
  {
    statuses: ["delivered"],
    label: "Delivered",
    note: "Enjoy — thank you for shopping with PROSANTI",
  },
];

/** Index of the step the order is actually sitting on (-1 when cancelled). */
export const currentStepIndex = (order: Order): number =>
  STEPS.findIndex((step) => step.statuses.includes(order.status));

const stepReached = (order: Order, step: number): boolean => {
  if (order.status === "cancelled") return false;
  const current = currentStepIndex(order);
  if (current !== -1) return step <= current;
  // Unknown/legacy status → fall back to the flow position.
  return STEPS[step].statuses.some(
    (s) => flowIndex(s) !== -1 && flowIndex(order.status) >= flowIndex(s),
  );
};

const stepTime = (order: Order, step: number): string | undefined => {
  for (const s of STEPS[step].statuses) {
    const entry = order.timeline.find((t) => t.status === s);
    if (entry) return clockTime(entry.at);
  }
  return undefined;
};

type Result =
  | { found: true; order: Order; via: "device" | "live" }
  | { found: false }
  | null;

export default function TrackView() {
  const { orders } = useLocalOrders();
  const demoMode = !isSupabaseConfigured();
  const [orderId, setOrderId] = useState("");
  const [phone, setPhone] = useState("");
  const [result, setResult] = useState<Result>(null);
  const [checking, setChecking] = useState(false);
  const [lookupFailed, setLookupFailed] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const id = orderId.trim().toUpperCase();
    // Local first: instant in demo mode and for this device's orders.
    const local = orders.find(
      (o) => o.id.toUpperCase() === id && samePhone(o.customer.phone, phone),
    );
    if (local) {
      setLookupFailed(false);
      setResult({ found: true, order: local, via: "device" });
      return;
    }
    // Otherwise ask the backend — cross-device orders live there.
    // Demo mode answers { demoMode: true }; anything unreachable shows an
    // honest “lookup failed” instead of a wrong “not found”.
    setChecking(true);
    setLookupFailed(false);
    try {
      const res = await fetch(
        `/api/track?id=${encodeURIComponent(id)}&phone=${encodeURIComponent(phone.trim())}`,
      );
      const data = (await res.json().catch(() => null)) as {
        demoMode?: boolean;
        order?: Order;
      } | null;
      if (res.ok && data?.order) {
        setResult({ found: true, order: data.order, via: "live" });
      } else if (res.status === 404 || data?.demoMode) {
        setResult({ found: false });
      } else {
        setLookupFailed(true);
      }
    } catch {
      setLookupFailed(true);
    } finally {
      setChecking(false);
    }
  };

  const tryDemo = () => {
    const sample =
      [...orders]
        .filter((o) => o.status !== "cancelled")
        .sort((a, b) => b.createdAt - a.createdAt)[0] ?? orders[0];
    if (!sample) return;
    setOrderId(sample.id);
    setPhone(sample.customer.phone);
    setResult({ found: true, order: sample, via: "device" });
  };

  const order = result?.found ? result.order : null;
  const via = result?.found ? result.via : null;

  return (
    <div className="grid gap-10 lg:grid-cols-[420px_1fr]">
      {/* Lookup */}
      <form
        onSubmit={submit}
        className="h-fit rounded-3xl bg-paper p-7 ring-1 ring-line lg:sticky lg:top-28"
      >
        <h2 className="font-display text-2xl font-medium text-forest-900">
          Track your order — Sunamganj Sadar
        </h2>
        <p className="mt-2 text-sm leading-6 text-ink-soft">
          District: Sunamganj, Upazila: Sunamganj Sadar, Hub: Traffic Point.
          No account needed — order ID + phone. PIN required for COD delivery.
        </p>
        <label className="mt-6 block">
          <span className="mb-1.5 block text-sm font-medium text-ink">
            Order ID
          </span>
          <div className="relative">
            <IconBox className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" />
            <input
              required
              value={orderId}
              onChange={(e) => setOrderId(e.target.value)}
              placeholder="PS-YYYYMMDD-XXXX"
              className="h-12 w-full rounded-2xl bg-ivory-50 pl-11 pr-4 text-sm text-ink ring-1 ring-line placeholder:text-ink-soft/50 focus:ring-2 focus:ring-forest-500"
            />
          </div>
        </label>
        <label className="mt-4 block">
          <span className="mb-1.5 block text-sm font-medium text-ink">
            Phone number
          </span>
          <div className="relative">
            <IconPhone className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" />
            <input
              required
              type="tel"
              inputMode="tel"
              pattern="(\+?88)?01[0-9]{9}"
              title="A valid Bangladeshi mobile number, e.g. 017XXXXXXXX or +88017XXXXXXXX"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="017XXXXXXXX"
              className="h-12 w-full rounded-2xl bg-ivory-50 pl-11 pr-4 text-sm text-ink ring-1 ring-line placeholder:text-ink-soft/50 focus:ring-2 focus:ring-forest-500"
            />
          </div>
        </label>
        <button
          type="submit"
          disabled={checking}
          className="mt-6 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-forest-800 text-sm font-semibold text-ivory-50 transition-colors hover:bg-forest-700 disabled:opacity-60"
        >
          <IconSearch className="h-4 w-4" />
          {checking ? "Checking…" : "Track order"}
        </button>
        {lookupFailed && (
          <p role="alert" className="mt-3 text-center text-xs leading-5 text-rose-700">
            Could not reach the shop — check your connection and try again.
          </p>
        )}
        {demoMode && (
          <button
            type="button"
            onClick={tryDemo}
            className="mt-3 w-full text-center text-xs text-ink-soft underline underline-offset-4 hover:text-forest-700"
          >
            View the newest demo order instead
          </button>
        )}
      </form>

      {/* Result */}
      <div>
        {!result ? (
          <div className="flex h-full min-h-[320px] flex-col items-center justify-center rounded-3xl border border-dashed border-line bg-ivory-100/50 px-8 text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-paper text-forest-700 ring-1 ring-line">
              <IconMapPin className="h-7 w-7" />
            </span>
            <h2 className="font-display mt-6 text-2xl font-medium text-forest-900">
              Where is my order?
            </h2>
            <p className="mt-2 max-w-sm text-sm leading-6 text-ink-soft">
              Enter your details to see the live timeline — confirmation,
              preparation, courier assignment and delivery.
            </p>
          </div>
        ) : !order ? (
          <div className="flex h-full min-h-[320px] flex-col items-center justify-center rounded-3xl bg-paper px-8 text-center ring-1 ring-line">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-rose-50 text-rose-700 ring-1 ring-rose-200">
              <IconSearch className="h-7 w-7" />
            </span>
            <h2 className="font-display mt-6 text-2xl font-medium text-forest-900">
              No order found
            </h2>
            <p className="mt-2 max-w-sm text-sm leading-6 text-ink-soft">
              Double-check the order ID and the phone number you ordered with.
              Orders placed on this device appear here straight away.
            </p>
            <button
              type="button"
              onClick={tryDemo}
              className="mt-6 text-xs font-medium text-forest-700 underline underline-offset-4 hover:text-forest-900"
            >
              Try the demo order
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Live Interactive Delivery Map & Security PIN */}
            <LiveDeliveryMap order={order} />

            {/* Timeline */}
            {order.status === "cancelled" && (
              <p
                role="status"
                className="rounded-2xl bg-rose-50 px-5 py-4 text-sm leading-6 text-rose-800 ring-1 ring-rose-200"
              >
                This order was cancelled. If that looks wrong, call us on
                01700-000000 with the order ID and we will check it for you.
              </p>
            )}
            <ol className="rounded-3xl bg-paper p-7 ring-1 ring-line sm:p-8">
              {STEPS.map((step, index) => {
                const reached = stepReached(order, index);
                // "Current" is the step the order is on — it used to point at
                // the *next*, unreached step, so a pending order claimed it
                // was already being confirmed.
                const current =
                  order.status !== "cancelled" &&
                  order.status !== "delivered" &&
                  index === currentStepIndex(order);
                const time = stepTime(order, index);
                return (
                  <li
                    key={step.label}
                    className="relative flex gap-4 pb-7 last:pb-0"
                  >
                    {index < STEPS.length - 1 && (
                      <span
                        aria-hidden="true"
                        className={`absolute left-[1.02rem] top-9 h-[calc(100%-2rem)] w-0.5 ${
                          reached && order.status !== "cancelled"
                            ? "bg-forest-600"
                            : "bg-line"
                        }`}
                      />
                    )}
                    <span
                      className={`relative z-10 flex h-[2.05rem] w-[2.05rem] shrink-0 items-center justify-center rounded-full ${
                        reached && order.status !== "cancelled"
                          ? "bg-forest-700 text-ivory-50"
                          : current
                            ? "bg-gold-500 text-forest-950 ring-4 ring-gold-500/20"
                            : "bg-ivory-100 text-ink-soft ring-1 ring-line"
                      }`}
                    >
                      {reached && order.status !== "cancelled" ? (
                        <IconCheck className="h-4 w-4" />
                      ) : current ? (
                        <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-forest-950" />
                      ) : (
                        <span className="h-2 w-2 rounded-full bg-current opacity-50" />
                      )}
                    </span>
                    <div className="pt-0.5">
                      <p
                        className={`text-sm font-semibold ${
                          reached || current ? "text-ink" : "text-ink-soft"
                        }`}
                      >
                        {step.label}
                        {current && (
                          <span className="ml-2 rounded-full bg-gold-200 px-2 py-0.5 text-[0.62rem] font-bold uppercase tracking-wide text-gold-700">
                            Current
                          </span>
                        )}
                      </p>
                      <p className="mt-1 text-xs leading-5 text-ink-soft">
                        {step.note}
                        {time && reached && (
                          <span className="ml-2 text-ink-soft/70">
                            · {time}
                          </span>
                        )}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>

            {/* Order snapshot */}
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="rounded-3xl bg-paper p-6 ring-1 ring-line">
                <h3 className="text-[0.7rem] font-semibold uppercase tracking-[0.24em] text-ink-soft">
                  Your order
                </h3>
                <ul className="mt-4 space-y-3">
                  {order.items.map((it, i) => (
                    <li key={i} className="flex items-center gap-3">
                      <Image
                        src={it.image}
                        alt=""
                        width={44}
                        height={44}
                        className="h-11 w-11 rounded-xl object-cover"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-ink">
                          {it.name}
                        </p>
                        <p className="text-xs text-ink-soft">
                          {it.variant} · ×{it.qty}
                        </p>
                      </div>
                      <p className="text-sm font-medium text-ink">
                        {formatBdt(it.unitPrice * it.qty)}
                      </p>
                    </li>
                  ))}
                </ul>
                <dl className="mt-4 space-y-1.5 border-t border-line pt-4 text-sm">
                  <div className="flex justify-between text-ink-soft">
                    <dt>Subtotal</dt>
                    <dd>{formatBdt(order.subtotal)}</dd>
                  </div>
                  <div className="flex justify-between text-ink-soft">
                    <dt>Delivery{(order as any).isPickup ? " — Pickup" : ""}{(order as any).isExpress ? " — Express" : ""}</dt>
                    <dd>
                      {(order as any).isPickup ? "Free (Pickup)" : order.deliveryCharge === 0 ? "Free" : formatBdt(order.deliveryCharge)}
                    </dd>
                  </div>
                  {((order.surchargeNight ?? 0) > 0 || (order.surchargeRain ?? 0) > 0 || (order.surchargeDistance ?? 0) > 0 || (order.surchargeExpress ?? 0) > 0 || (order as any).surchargeWeight > 0) && (
                    <div className="text-xs text-ink-soft bg-amber-50 p-2 rounded-xl">
                      {(order.surchargeNight ?? 0) > 0 && <div>Night: {formatBdt(order.surchargeNight ?? 0)}</div>}
                      {(order.surchargeRain ?? 0) > 0 && <div>Rain: {formatBdt(order.surchargeRain ?? 0)}</div>}
                      {(order.surchargeDistance ?? 0) > 0 && <div>Distance: {formatBdt(order.surchargeDistance ?? 0)}</div>}
                      {(order.surchargeExpress ?? 0) > 0 && <div>Express: {formatBdt(order.surchargeExpress ?? 0)}</div>}
                      {(order as any).surchargeWeight > 0 && <div>Weight: {formatBdt((order as any).surchargeWeight)}</div>}
                    </div>
                  )}
                  {(order as any).tipAmount > 0 && (
                    <div className="flex justify-between text-forest-700">
                      <dt>💝 Tip</dt>
                      <dd>+{formatBdt((order as any).tipAmount)}</dd>
                    </div>
                  )}
                  {(order as any).scheduledAt && (
                    <div className="text-xs text-sky-800">Scheduled: {new Date((order as any).scheduledAt).toLocaleString()} {(order as any).deliveryWindow ?? ""}</div>
                  )}
                  {order.coupon && (
                    <div className="flex justify-between text-emerald-700">
                      <dt>Coupon · {order.coupon.code}</dt>
                      <dd>−{formatBdt(order.coupon.discount)}</dd>
                    </div>
                  )}
                  <div className="flex justify-between pt-1 font-semibold text-forest-900">
                    <dt>Total (COD){(order as any).isPickup ? " — Pickup" : ""}</dt>
                    <dd>{formatBdt(order.total)}</dd>
                  </div>
                </dl>
              </div>
              <div className="rounded-3xl bg-paper p-6 ring-1 ring-line">
                <h3 className="text-[0.7rem] font-semibold uppercase tracking-[0.24em] text-ink-soft">
                  Delivery — Sunamganj Sadar
                </h3>
                <p className="mt-3 text-[11px] font-bold uppercase tracking-wider text-ink-soft">জেলা: Sunamganj · উপজেলা: Sunamganj Sadar · Hub: Traffic Point</p>
                <p className="mt-4 flex items-start gap-2.5 text-sm text-ink">
                  <IconMapPin className="mt-0.5 h-4 w-4 shrink-0 text-forest-700" />
                  {order.customer.area}
                  {order.customer.address ? `, ${order.customer.address}` : ""}
                </p>
                <p className="mt-3 flex items-start gap-2.5 text-sm text-ink">
                  <IconTruck className="mt-0.5 h-4 w-4 shrink-0 text-forest-700" />
                  {order.zoneName} · {order.etaLabel}
                  {order.zoneId === "z4" && <span className="ml-2 rounded-full bg-amber-200 px-2 py-0.5 text-[10px] font-bold text-amber-900">Outside Sadar</span>}
                  {(order as any).isPickup && <span className="ml-2 rounded-full bg-sky-200 px-2 py-0.5 text-[10px] font-bold text-sky-900">Pickup</span>}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <a href={`https://wa.me/8801700000000?text=${encodeURIComponent(`PROSANTI order ${order.id} track: https://prosanti.com/track/${order.id}`)}`} target="_blank" className="rounded-full bg-[#25D366] px-3 py-1 text-xs font-semibold text-white">WhatsApp Support</a>
                  {order.lat && order.lng && <a href={`https://www.openstreetmap.org/?mlat=${order.lat}&mlon=${order.lng}#map=16/${order.lat}/${order.lng}`} target="_blank" className="rounded-full bg-paper px-3 py-1 text-xs ring-1 ring-line">View Pin on Map</a>}
                </div>
                {order.customer.note && (
                  <p className="mt-3 text-xs leading-5 text-ink-soft">
                    <strong className="text-ink">Note:</strong> {order.customer.note}
                  </p>
                )}
                {(demoMode || via === "device") && (
                  <p className="mt-6 rounded-2xl bg-ivory-100 px-4 py-3 text-xs leading-5 text-ink-soft">
                    <strong className="text-ink">Demo data.</strong>{" "}
                    {demoMode
                      ? "This device is your browser's demo warehouse: the order status moves when the PROSANTI admin panel advances it."
                      : "This order lives in this browser only — orders placed on PROSANTI are tracked live from our system instead."}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
