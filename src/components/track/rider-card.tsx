"use client";

/**
 * The rider card — who is coming, and how to reach them.
 *
 * The order payload has carried the rider's name, phone and rating since
 * slice 9, but the only place the customer could act on it was the delay
 * note: the call button rendered once `eta.late` was true. So an on-time
 * delivery gave no way to reach the person holding the parcel — while the
 * rider could always call the customer (rider/dashboard/task-card.tsx). One
 * way is not a relationship.
 *
 * The card shows as soon as a rider is on the job and keeps the call button
 * until the handover. It never invents a reason or a progress line — the map
 * below it does the "where", this only answers "who" and "how do I talk to
 * them".
 */

import { useLanguage } from "@/components/i18n/language-provider";
import { IconPhone, IconStar } from "@/components/ui/icons";
import { bnDigits } from "@/lib/arrival";
import type { Order } from "@/lib/orders";
import { orderStage } from "./order-now-banner";

export default function RiderCard({ order }: { order: Order }) {
  const { t, lang } = useLanguage();
  const rider = order.rider;
  if (!rider) return null;
  const stage = orderStage(order);
  // Cancelled or failed: nobody is coming, and a dead phone number on screen
  // is worse than no card.
  if (stage === "cancelled" || stage === "failed") return null;

  const done = stage === "delivered";
  const digits = (s: string): string => (lang === "bn" ? bnDigits(s) : s);
  const rating =
    rider.ratingCount > 0
      ? t("track.riderRating")
          .replace("{avg}", digits(rider.ratingAvg.toFixed(1)))
          .replace("{count}", digits(String(rider.ratingCount)))
      : t("track.riderNoRating");

  return (
    <section
      aria-label={t("track.riderCardTitle")}
      data-testid="rider-card"
      className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-3xl bg-paper p-5 ring-1 ring-line sm:p-6"
    >
      <span
        aria-hidden="true"
        className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-forest-100 text-sm font-bold text-forest-900"
      >
        {rider.name.trim().charAt(0).toUpperCase() || "R"}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-soft">
          {t("track.riderCardTitle")}
        </p>
        <p className="mt-0.5 truncate font-display text-lg text-forest-900">
          {rider.name}
        </p>
        <p className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-soft">
          <IconStar className="h-3.5 w-3.5 text-gold-500" />
          {rating}
        </p>
      </div>
      {done ? (
        <p className="text-sm text-ink-soft">{t("track.riderDelivered")}</p>
      ) : (
        <div className="flex flex-col items-start gap-1.5 sm:items-end">
          <a
            href={`tel:${rider.phone.replace(/[^\d+]/g, "")}`}
            data-testid="rider-card-call"
            className="inline-flex h-11 items-center gap-2 rounded-full bg-forest-800 px-5 text-xs font-semibold text-ivory-50 transition-colors hover:bg-forest-700"
          >
            <IconPhone className="h-4 w-4" />
            {t("track.riderCall")}
          </a>
          <span className="max-w-[15rem] text-[11px] leading-4 text-ink-soft">
            {t("track.riderCardHint")}
          </span>
        </div>
      )}
    </section>
  );
}
