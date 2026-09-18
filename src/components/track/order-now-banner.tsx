"use client";

/**
 * "Right now" banner on /track (UX audit 2026-09-18, P2 #21).
 *
 * The tracker used to render every panel for every order — a pulsing rider
 * map for a pickup order, a security PIN for a cancelled one, "calling the
 * nearest rider" under a delivered parcel. This one line is computed from the
 * order's real state and payment and tells the customer the one thing that is
 * true at this moment, plus the PIN exactly when they will need it (rider on
 * the way). The view uses `orderStage()` to decide which panels to mount.
 */

import { useLanguage } from "@/components/i18n/language-provider";
import { IconCheck, IconShield, IconTruck } from "@/components/ui/icons";
import { courierEta, isCourierZone } from "@/lib/delivery";
import { getDeliveryCode, type Order } from "@/lib/orders";
import { SUNAMGANJ_HUB } from "@/lib/sunamganj";

export type OrderStage =
  | "cancelled"
  | "delivered"
  | "verifying"
  | "pending"
  | "confirmed"
  | "ready"
  | "assigned"
  | "out";

/** One stage per order — the same rules the banner and the panel gating use. */
export const orderStage = (order: Order): OrderStage => {
  if (order.status === "cancelled") return "cancelled";
  if (order.status === "delivered") return "delivered";
  if (order.payment !== "cod" && order.paymentStatus === "pending_verification") return "verifying";
  switch (order.status) {
    case "pending":
      return "pending";
    case "confirmed":
    case "preparing":
      return "confirmed";
    case "ready-for-pickup":
      return "ready";
    case "courier-assigned":
      return "assigned";
    case "out-for-delivery":
      return "out";
    default:
      return "confirmed";
  }
};

/** The rider map/PIN card only makes sense while a rider can actually come. */
export const showsRiderMap = (order: Order): boolean => {
  const stage = orderStage(order);
  if (order.isPickup || order.isReturn) return false;
  if (isCourierZone(order.zoneId)) return false;
  return stage !== "cancelled" && stage !== "delivered";
};

export default function OrderNowBanner({ order }: { order: Order }) {
  const { t, lang } = useLanguage();
  const stage = orderStage(order);
  const wallet = order.payment === "bkash" ? "bKash" : order.payment === "nagad" ? "Nagad" : null;
  const courier = isCourierZone(order.zoneId) && !order.isPickup;

  let text: string;
  if (stage === "cancelled") text = t("track.nowCancelled");
  else if (stage === "delivered") text = t("track.nowDelivered");
  else if (stage === "verifying") text = t("track.nowVerifying").replace("{wallet}", wallet ?? "");
  else if (order.isPickup && (stage === "ready" || stage === "assigned" || stage === "out"))
    text = t("track.nowPickup").replace("{hub}", SUNAMGANJ_HUB);
  else if (courier && (stage === "ready" || stage === "assigned" || stage === "out"))
    text = t("track.nowCourier").replace("{eta}", courierEta(lang));
  else if (stage === "pending") text = t("track.nowPending");
  else if (stage === "confirmed") text = t("track.nowConfirmed");
  else if (stage === "ready") text = t("track.nowReady");
  else if (stage === "assigned")
    text = order.rider
      ? t("track.nowAssigned").replace("{name}", order.rider.name)
      : t("track.nowReady");
  else text = t("track.nowOut");

  const tone =
    stage === "cancelled"
      ? "bg-rose-50 text-rose-900 ring-rose-200"
      : stage === "delivered"
        ? "bg-forest-50 text-forest-900 ring-forest-200"
        : stage === "verifying"
          ? "bg-amber-50 text-amber-900 ring-amber-200"
          : "bg-gold-50 text-forest-900 ring-gold-200";

  // The PIN is shown exactly when it is about to be asked for: OUR rider on
  // the way. A third-party courier never sees the PIN, pickup hands over at
  // the counter, and a return parcel goes the other way.
  const showPin = stage === "out" && !order.isPickup && !order.isReturn && !courier;
  const pin = order.deliveryCode ?? getDeliveryCode(order.id);

  return (
    <div
      role="status"
      data-testid="order-now"
      data-stage={stage}
      className={`flex flex-wrap items-center gap-3 rounded-2xl px-5 py-4 text-sm leading-6 ring-1 ${tone}`}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-paper/80">
        {stage === "delivered" ? (
          <IconCheck className="h-4 w-4" />
        ) : stage === "out" ? (
          <IconTruck className="h-4 w-4" />
        ) : (
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-current" />
        )}
      </span>
      <p className="min-w-0 flex-1">{text}</p>
      {showPin ? (
        <div className="flex items-center gap-2 rounded-xl bg-paper px-3 py-2 ring-1 ring-line" data-testid="order-now-pin">
          <IconShield className="h-4 w-4 text-gold-600" />
          <div className="leading-tight">
            <p className="text-[0.6rem] font-semibold uppercase tracking-[0.18em] text-ink-soft">
              {t("track.pinTitle")}
            </p>
            <p className="font-mono text-lg font-bold tracking-[0.3em] text-forest-900">{pin}</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
