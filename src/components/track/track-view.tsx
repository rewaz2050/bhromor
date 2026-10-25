"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { clearLastOrder, readLastOrder, type LastOrder } from "@/lib/last-order";
import { deliverySlotSummary } from "@/lib/delivery-slots";
import {
  PUBLIC_STEPS,
  publicPhase,
  publicStepDone,
  type Order,
} from "@/lib/orders";
import { formatBdt } from "@/lib/format";
import { clockTime } from "@/components/admin/order-ui";
import { useLanguage } from "@/components/i18n/language-provider";
import type { TranslationKey } from "@/lib/translations";
import {
  IconBox,
  IconCheck,
  IconMapPin,
  IconPhone,
  IconSearch,
  IconTruck,
  IconClock,
} from "@/components/ui/icons";
import { LiveDeliveryMap } from "./live-delivery-map";
import ReturnPanel from "@/components/returns/return-panel";
import WarrantyPanel from "@/components/warranty/warranty-panel";
import ReviewAsk from "@/components/track/review-ask";
import RiderRatingAsk from "@/components/track/rider-rating-ask";
import PaymentStatus from "./payment-status";
import CancelPanel from "./cancel-panel";
import ReorderButton from "@/components/orders/reorder-button";
import OrderNowBanner, { orderStage, showsRiderMap } from "./order-now-banner";
import NotifyOptIn from "./notify-opt-in";
import ShareTrackerButton from "./share-tracker-button";
import WhileYouWaitRail from "./while-you-wait-rail";
import DelayNote from "./delay-note";
import RiderCard from "./rider-card";
import MessageShop from "./message-shop";
import DeliveryProof from "./delivery-proof";
import { courierEta, isCourierZone } from "@/lib/delivery";
import { tidyPhoneInput } from "@/lib/phone";
import { useLiveRefresh } from "@/lib/use-live-refresh";
import { bnDigits } from "@/lib/arrival";

/** How often an open tracker re-reads the order (see the poll below). */
const TRACK_REFRESH_MS = 15_000;

/**
 * Public-facing steps — the four milestones from `PUBLIC_STEPS`
 * (Order placed → Confirmed → Picked up → Delivered). Copy lives in
 * translations.ts so the Bengali switch covers the timeline too.
 */
const STEP_COPY: Record<
  (typeof PUBLIC_STEPS)[number]["key"],
  { label: TranslationKey; note: TranslationKey }
> = {
  placed: { label: "track.stepPlaced", note: "track.stepPlacedNote" },
  confirmed: { label: "track.stepConfirmed", note: "track.stepConfirmedNote" },
  "picked-up": { label: "track.stepPickedUp", note: "track.stepPickedUpNote" },
  delivered: { label: "track.stepDelivered", note: "track.stepDeliveredNote" },
};

/** Index of the public step the order is sitting in (-1 when cancelled). */
export const currentStepIndex = (order: Order): number =>
  publicPhase(order.status);

/** The milestone has actually happened (not merely "in progress"). */
export const stepReached = (order: Order, step: number): boolean =>
  publicStepDone(order.status, step);

/**
 * When the milestone happened — the time of its `doneAt` state, or (for a
 * step still in progress) the earliest internal state reached inside it, so
 * the customer sees when the shop packed the order while the rider is
 * still on the way.
 */
export const stepTime = (order: Order, step: number): string | undefined => {
  const def = PUBLIC_STEPS[step];
  if (!def) return undefined;
  const done = order.timeline.find((t) => t.status === def.doneAt);
  if (done) return clockTime(done.at);
  for (const s of def.statuses) {
    const entry = order.timeline.find((t) => t.status === s);
    if (entry) return clockTime(entry.at);
  }
  return undefined;
};

type Result =
  | { found: true; order: Order; via: "live" }
  | { found: false }
  | null;

export default function TrackView() {
  const { t, lang } = useLanguage();
  /** The shop's one number rule (UX plan §1.4): a Bangla reader reads Bangla
   *  digits everywhere, including the quantities on their own order. */
  const digits = (n: number | string) =>
    lang === "bn" ? bnDigits(String(n)) : String(n);
  const orderIdInput = useRef<HTMLInputElement>(null);
  const resultPanel = useRef<HTMLDivElement>(null);
  const focusNextResult = useRef(false);
  const [orderId, setOrderId] = useState("");
  const [phone, setPhone] = useState("");
  const [result, setResult] = useState<Result>(null);
  const [checking, setChecking] = useState(false);
  const [lookupFailed, setLookupFailed] = useState(false);
  /** "আপনার শেষ অর্ডার" — remembered by the receipt on this device (P0 #5). */
  const [lastOrder, setLastOrder] = useState<LastOrder | null>(null);
  const autoLookedUp = useRef(false);
  // The shop's real WhatsApp number (ops settings) — the support button
  // renders only when it is configured, never a placeholder.
  const [contactNumber, setContactNumber] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/contact", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { whatsapp?: string | null } | null) => {
        if (!cancelled && d?.whatsapp) setContactNumber(d.whatsapp);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const lookup = useCallback(
    async (rawId: string, rawPhone: string, silent = false) => {
      const id = rawId.trim().toUpperCase();
      const ph = rawPhone.trim();
      if (!id || !ph) return;
      // A background re-check must not flash the form: the customer is
      // reading a live order, not waiting on a search.
      if (!silent) {
        setChecking(true);
        setLookupFailed(false);
      }
      try {
        const res = await fetch(
          `/api/track?id=${encodeURIComponent(id)}&phone=${encodeURIComponent(ph)}`,
        );
        const data = (await res.json().catch(() => null)) as {
          order?: Order;
        } | null;
        if (res.ok && data?.order) {
          focusNextResult.current = !silent;
          setResult({ found: true, order: data.order, via: "live" });
        } else if (silent) {
          // One dropped poll is not news — the next tick tries again.
          return;
        } else if (res.status === 404) {
          focusNextResult.current = true;
          setResult({ found: false });
        } else {
          setLookupFailed(true);
        }
      } catch {
        if (!silent) setLookupFailed(true);
      } finally {
        if (!silent) setChecking(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!focusNextResult.current) return;
    focusNextResult.current = false;
    resultPanel.current?.focus();
  }, [result]);

  /**
   * The page used to read the order exactly once, so it could sit on
   * "Confirmed" for the whole delivery while the rider had already picked it
   * up — the rider's pin moved (LIVE_POLL_MS) but the milestone did not. Push
   * covers a closed tab; nothing covered an open one.
   *
   * 15 s sits far inside /api/track's 30-per-minute-per-IP limit even with a
   * couple of tabs open, and the poll pauses on a hidden tab so a phone left
   * on the tracker overnight costs nothing.
   */
  const order = result?.found ? result.order : null;
  const stage = order ? orderStage(order) : null;
  // Nothing left to change — stop asking.
  const orderMoving =
    stage !== null && stage !== "delivered" && stage !== "cancelled" && stage !== "failed";
  const recheck = useCallback(() => {
    void lookup(orderId, phone, true);
  }, [lookup, orderId, phone]);
  useLiveRefresh(orderMoving, TRACK_REFRESH_MS, recheck);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    void lookup(orderId, phone);
  };

  // /track?id=…&phone=… (the receipt link) → prefill AND look up once.
  // Read from the URL after mount (not useSearchParams) so the form itself
  // is still server-rendered — no Suspense bailout on a static page.
  useEffect(() => {
    if (autoLookedUp.current) return;
    const params = new URLSearchParams(window.location.search);
    const paramId = params.get("id")?.trim() ?? "";
    const paramPhone = params.get("phone")?.trim() ?? "";
    if (!paramId) return;
    autoLookedUp.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- URL → form prefill, once
    setOrderId(paramId.toUpperCase());
    if (paramPhone) {
      setPhone(paramPhone);
      void lookup(paramId, paramPhone);
    }
  }, [lookup]);

  // Last order placed on this device — one tap instead of typing both fields.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage read must happen post-mount
    setLastOrder(readLastOrder());
  }, []);

  const useLastOrder = () => {
    if (!lastOrder) return;
    setOrderId(lastOrder.id);
    setPhone(lastOrder.phone);
    void lookup(lastOrder.id, lastOrder.phone);
  };

  return (
    <div className="grid gap-10 lg:grid-cols-[420px_1fr]">
      {/* Lookup */}
      <form
        onSubmit={submit}
        aria-busy={checking}
        className="h-fit rounded-2xl bg-paper p-5 ring-1 ring-line sm:p-7 lg:sticky lg:top-28"
      >
        <h2 className="font-display text-2xl font-medium text-forest-900">
          {t("track.lookupTitle")}
        </h2>
        <p className="mt-2 text-sm leading-6 text-ink-soft">
          {t("track.lookupSub")}
        </p>
        {lastOrder && lastOrder.id !== (order?.id ?? "") ? (
          <div
            className="mt-5 flex items-center justify-between gap-3 rounded-2xl bg-gold-50 px-4 py-3 ring-1 ring-gold-200"
            data-testid="last-order-shortcut"
          >
            <div className="min-w-0">
              <p className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-ink-soft">
                {t("track.lastOrderLabel")}
              </p>
              <p className="truncate font-mono text-sm font-bold text-forest-900">{lastOrder.id}</p>
              {lastOrder.total ? (
                <p className="text-[11px] text-ink-soft">{formatBdt(lastOrder.total)} · {clockTime(lastOrder.placedAt)}</p>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                onClick={useLastOrder}
                disabled={checking}
                className="min-h-11 rounded-full bg-forest-800 px-3.5 text-xs font-semibold text-ivory-50 hover:bg-forest-700 disabled:opacity-60"
              >
                {t("track.lastOrderTrack")}
              </button>
              <button
                type="button"
                onClick={() => {
                  clearLastOrder();
                  setLastOrder(null);
                }}
                aria-label={t("track.lastOrderDismiss")}
                className="flex h-11 w-11 items-center justify-center rounded-full px-2 text-xs text-ink-soft ring-1 ring-line hover:bg-paper"
              >
                ✕
              </button>
            </div>
          </div>
        ) : null}
        <label className="mt-6 block">
          <span className="mb-1.5 block text-sm font-medium text-ink">
            {t("track.orderIdLabel")}
          </span>
          <div className="relative">
            <IconBox className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" />
            <input
              required
              ref={orderIdInput}
              autoCapitalize="characters"
              spellCheck={false}
              value={orderId}
              onChange={(e) => setOrderId(e.target.value)}
              placeholder="PS-YYYYMMDD-XXXX"
              className="h-12 w-full rounded-2xl bg-ivory-50 pl-11 pr-4 text-sm text-ink ring-1 ring-line placeholder:text-ink-soft/50 focus:ring-2 focus:ring-forest-500"
            />
          </div>
        </label>
        <label className="mt-4 block">
          <span className="mb-1.5 block text-sm font-medium text-ink">
            {t("track.phoneLabel")}
          </span>
          <div className="relative">
            <IconPhone className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" />
            <input
              required
              type="tel"
              inputMode="tel"
              pattern="(\+?88)?01[0-9]{9}"
              title={t("track.phoneTitle")}
              value={phone}
              onChange={(e) => setPhone(tidyPhoneInput(e.target.value))}
              autoComplete="tel"
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
          {checking ? t("track.checking") : t("track.submit")}
        </button>
        {lookupFailed && (
          <p role="alert" className="mt-3 text-center text-xs leading-5 text-rose-700">
            {t("track.lookupFailed")}
          </p>
        )}
      </form>

      {/* A concise live status avoids re-announcing the entire live timeline. */}
      <p role="status" className="sr-only">
        {checking ? t("track.checking") : result ? result.found ? t("track.orderFound") : t("track.notFoundTitle") : ""}
      </p>
      {/* Result: manual lookup moves focus here, background refresh never does. */}
      <div ref={resultPanel} tabIndex={-1} role="region" aria-label={t("track.resultLabel")} className="min-w-0 scroll-mt-28">
        {!result ? (
          <div className="flex h-full min-h-[320px] flex-col items-center justify-center rounded-3xl border border-dashed border-line bg-ivory-100/50 px-8 text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-paper text-forest-700 ring-1 ring-line">
              <IconMapPin className="h-7 w-7" />
            </span>
            <h2 className="font-display mt-6 text-2xl font-medium text-forest-900">
              {t("track.emptyTitle")}
            </h2>
            <p className="mt-2 max-w-sm text-sm leading-6 text-ink-soft">
              {t("track.emptyBody")}
            </p>
          </div>
        ) : !order ? (
          <div className="flex h-full min-h-[320px] flex-col items-center justify-center rounded-3xl bg-paper px-8 text-center ring-1 ring-line">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-rose-50 text-rose-700 ring-1 ring-rose-200">
              <IconSearch className="h-7 w-7" />
            </span>
            <h2 className="font-display mt-6 text-2xl font-medium text-forest-900">
              {t("track.notFoundTitle")}
            </h2>
            <p className="mt-2 max-w-sm text-sm leading-6 text-ink-soft">
              {t("track.notFoundBody")}
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-3">
              <button type="button" onClick={() => orderIdInput.current?.focus()} className="inline-flex min-h-11 items-center rounded-lg border border-line px-4 text-sm font-semibold text-forest-800">
                {t("track.checkDetails")}
              </button>
              <Link href="/contact" className="inline-flex min-h-11 items-center rounded-lg px-4 text-sm text-forest-800 underline underline-offset-4">
                {t("track.contactSupport")}
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* P2 #21: the one thing that is true right now (+ the PIN when a rider is on the way) */}
            <OrderNowBanner key={`now-${order.id}-${order.status}`} order={order} />

            {/* P1 #8: wallet-payment state (COD orders render nothing) */}
            <PaymentStatus order={order} />

            {/* 2026-09-24: the shopper's own phone — every step pushed, so
                "order kothay?" stops being a phone call. Sits above the
                cancel panel: it is the first thing worth offering on a live
                order. */}
            <NotifyOptIn
              orderId={order.id}
              phone={order.customer?.phone ?? ""}
              status={order.status}
            />

            {/* P1 #14: cancel online while the shop has not packed it yet */}
            <CancelPanel
              key={`cancel-${order.id}`}
              order={order}
              phone={phone}
              contactNumber={contactNumber}
              onCancelled={(next) => setResult({ found: true, order: next, via: "live" })}
            />

            {/* Live delivery map & security PIN — only while a rider can
                actually come (P2 #21): not for pickup, courier, delivered
                or cancelled orders. */}
            {/* Who is coming and how to reach them — always, not only once
                the parcel is late (2026-10-11). Renders nothing with no rider
                on the job, so pickup / courier orders stay clean. */}
            <RiderCard order={order} />

            {showsRiderMap(order) ? <LiveDeliveryMap order={order} /> : null}

            {/* Post-purchase pass (2026-10-06): when the promised window has
                passed, say so in minutes — silence is what turns a late
                parcel into a phone call. */}
            <DelayNote order={order} contactNumber={contactNumber} />

            {/* Ask the shop without leaving the page — the thread stays with
                the order (2026-10-11). Hidden for pickup/courier orders where
                there is no shop conversation to have about a delivery. */}
            <MessageShop order={order} />

            {/* The rider's handover photo — the parcel did arrive, here is
                where it was left. Renders nothing without a photo. */}
            <DeliveryProof order={order} />

            {/* P1 #13: return/exchange — status, or the home-pickup request */}
            <ReturnPanel
              order={order}
              onTrack={(orderNo, phone) => {
                setOrderId(orderNo);
                setPhone(phone);
              }}
            />

            {/* P1 #14: warranty claims on delivered, warranted items
                (keyed by order — a new lookup remounts with fresh state) */}
            <WarrantyPanel key={order.id} order={order} />

            {/* Delivered → ask for a one-line review of the bought pieces. */}
            <ReviewAsk order={order} />

            {/* Delivered with a rider → rate the delivery (202609250008).
                Keyed by order + phone so a new lookup starts fresh; hidden
                entirely for pickup/courier orders — no rider, no rating. */}
            <RiderRatingAsk key={`rate-${order.id}`} order={order} phone={phone} />

            {/* Timeline */}
            {order.status === "cancelled" && contactNumber && (
              <p
                role="note"
                className="rounded-2xl bg-paper px-5 py-3 text-xs leading-5 text-ink-soft ring-1 ring-line"
              >
                {/* Split on the placeholder so the number stays bold inside a
                    sentence that reads naturally in either language. */}
                {(() => {
                  const [before, after = ""] =
                    t("track.cancelledNote").split("{number}");
                  return (
                    <>
                      {before}
                      <span className="font-semibold text-ink">
                        {contactNumber}
                      </span>
                      {after}
                    </>
                  );
                })()}
              </p>
            )}
            <ol className="rounded-3xl bg-paper p-7 ring-1 ring-line sm:p-8">
              {PUBLIC_STEPS.map((step, index) => {
                const reached = stepReached(order, index);
                // "Current" is the step the order is on — it used to point at
                // the *next*, unreached step, so a pending order claimed it
                // was already being confirmed.
                const current =
                  order.status !== "cancelled" &&
                  order.status !== "delivered" &&
                  index === currentStepIndex(order);
                const time = stepTime(order, index);
                const copy = STEP_COPY[step.key];
                // Step 3 in progress: say honestly where the parcel is.
                const note =
                  step.key === "picked-up" && current && !reached
                    ? order.status === "ready-for-pickup" || !order.rider
                      ? t("track.stepPickedUpWaiting")
                      : t("track.stepPickedUpAssigned").replace(
                          "{name}",
                          order.rider.name,
                        )
                    : t(copy.note);
                return (
                  <li
                    key={step.key}
                    className="relative flex gap-4 pb-7 last:pb-0"
                  >
                    {index < PUBLIC_STEPS.length - 1 && (
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
                        {t(copy.label)}
                        {current && (
                          <span className="ml-2 rounded-full bg-gold-200 px-2 py-0.5 text-[0.62rem] font-bold uppercase tracking-wide text-gold-700">
                            {t("track.current")}
                          </span>
                        )}
                      </p>
                      <p className="mt-1 text-xs leading-5 text-ink-soft">
                        {note}
                        {time && (
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
                  {t("track.snapshotTitle")}
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
                          {it.variant} ·{" "}
                          {t("track.itemQty").replace("{qty}", digits(it.qty))}
                        </p>
                      </div>
                      <p className="text-sm font-medium text-ink">
                        {formatBdt(it.unitPrice * it.qty)}
                      </p>
                    </li>
                  ))}
                </ul>
                {!order.isReturn ? (
                  <ReorderButton
                    className="mt-4"
                    lines={order.items.map((it) => ({
                      productId: it.productId,
                      variantLabel: it.variant,
                      qty: it.qty,
                      name: it.name,
                    }))}
                  />
                ) : null}
                <dl className="mt-4 space-y-1.5 border-t border-line pt-4 text-sm">
                  <div className="flex justify-between text-ink-soft">
                    <dt>{t("track.subtotal")}</dt>
                    <dd>{formatBdt(order.subtotal)}</dd>
                  </div>
                  <div className="flex justify-between text-ink-soft">
                    <dt>
                      {order.isPickup
                        ? t("track.deliveryPickup")
                        : order.isExpress
                          ? t("track.deliveryExpress")
                          : t("track.delivery")}
                    </dt>
                    <dd>
                      {order.isPickup
                        ? t("track.freePickup")
                        : order.deliveryCharge === 0
                          ? order.freeDeliveryBy === "shop"
                            ? t("track.freeShop")
                            : order.freeDeliveryBy === "platform"
                              ? t("track.freePlatform")
                              : t("track.free")
                          : formatBdt(order.deliveryCharge)}
                    </dd>
                  </div>
                  {((order.surchargeNight ?? 0) > 0 || (order.surchargeRain ?? 0) > 0 || (order.surchargeDistance ?? 0) > 0 || (order.surchargeExpress ?? 0) > 0 || (order.surchargeWeight ?? 0) > 0) && (
                    <div className="text-xs text-ink-soft bg-amber-50 p-2 rounded-xl">
                      {(order.surchargeNight ?? 0) > 0 && <div>{t("track.surchargeNight")}: {formatBdt(order.surchargeNight ?? 0)}</div>}
                      {(order.surchargeRain ?? 0) > 0 && <div>{t("track.surchargeRain")}: {formatBdt(order.surchargeRain ?? 0)}</div>}
                      {(order.surchargeDistance ?? 0) > 0 && <div>{t("track.surchargeDistance")}: {formatBdt(order.surchargeDistance ?? 0)}</div>}
                      {(order.surchargeExpress ?? 0) > 0 && <div>{t("track.surchargeExpress")}: {formatBdt(order.surchargeExpress ?? 0)}</div>}
                      {(order.surchargeWeight ?? 0) > 0 && <div>{t("track.surchargeWeight")}: {formatBdt(order.surchargeWeight ?? 0)}</div>}
                    </div>
                  )}
                  {(order.tipAmount ?? 0) > 0 && (
                    <div className="flex justify-between text-forest-700">
                      <dt>{t("track.tip")}</dt>
                      <dd>+{formatBdt(order.tipAmount ?? 0)}</dd>
                    </div>
                  )}
                  {deliverySlotSummary(order, lang) && (
                    <div className="rounded-xl bg-sky-50 px-2.5 py-1.5 text-xs text-sky-900 ring-1 ring-sky-200" data-testid="track-slot">
                      <IconClock className="mr-1 inline h-4 w-4 align-[-3px]" /> {lang === "bn" ? "ডেলিভারি সময়" : "Delivery slot"}: {deliverySlotSummary(order, lang)}
                    </div>
                  )}
                  {order.coupon && (
                    <div className="flex justify-between text-emerald-700">
                      <dt>{t("track.coupon")} · {order.coupon.code}</dt>
                      <dd>−{formatBdt(order.coupon.discount)}</dd>
                    </div>
                  )}
                  <div className="flex justify-between pt-1 font-semibold text-forest-900">
                    <dt>
                      {t("track.total")} (
                      {order.payment === "bkash"
                        ? "bKash"
                        : order.payment === "nagad"
                          ? "Nagad"
                          : t("track.paymentCod")}
                      )
                      {order.isPickup ? t("track.pickupSuffix") : ""}
                    </dt>
                    <dd>{formatBdt(order.total)}</dd>
                  </div>
                </dl>
              </div>
              <div className="rounded-3xl bg-paper p-6 ring-1 ring-line">
                <h3 className="text-[0.7rem] font-semibold uppercase tracking-[0.24em] text-ink-soft">
                  {t("track.deliveryCardTitle")}
                </h3>
                <p className="mt-3 text-[11px] font-bold uppercase tracking-wider text-ink-soft">{t("track.districtLine")}</p>
                <p className="mt-4 flex items-start gap-2.5 text-sm text-ink">
                  <IconMapPin className="mt-0.5 h-4 w-4 shrink-0 text-forest-700" />
                  {order.customer.area}
                  {order.customer.address ? `, ${order.customer.address}` : ""}
                </p>
                <p className="mt-3 flex items-start gap-2.5 text-sm text-ink">
                  <IconTruck className="mt-0.5 h-4 w-4 shrink-0 text-forest-700" />
                  {order.zoneName} · {isCourierZone(order.zoneId) && !order.isPickup ? courierEta(lang) : order.etaLabel}
                  {isCourierZone(order.zoneId) && <span className="ml-2 rounded-full bg-amber-200 px-2 py-0.5 text-[10px] font-bold text-amber-900">{t("track.outsideSadar")}</span>}
                  {order.isPickup && <span className="ml-2 rounded-full bg-sky-200 px-2 py-0.5 text-[10px] font-bold text-sky-900">{t("track.pickupBadge")}</span>}
                  {!order.isPickup && order.deliveryWindow && order.deliveryWindow !== "now" && (
                    <span className="ml-2 rounded-full bg-sky-200 px-2 py-0.5 text-[10px] font-bold text-sky-900">
                      <IconClock className="mr-1 inline h-4 w-4 align-[-3px]" /> {deliverySlotSummary({ deliveryWindow: order.deliveryWindow }, lang)}
                    </span>
                  )}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {contactNumber && (
                    <a
                      href={`https://wa.me/88${contactNumber}?text=${encodeURIComponent(`PROSANTI order ${order.id} track: ${typeof window !== "undefined" ? window.location.origin : ""}/track`)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex min-h-11 items-center rounded-full bg-[#25D366] px-4 text-xs font-semibold text-white"
                    >
                      {t("track.whatsappSupport")}
                    </a>
                  )}
                  {order.lat && order.lng && <a href={`https://www.openstreetmap.org/?mlat=${order.lat}&mlon=${order.lng}#map=16/${order.lat}/${order.lng}`} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center rounded-full bg-paper px-4 text-xs ring-1 ring-line">{t("track.viewPin")}</a>}
                  {/* UX plan §7 — hand the same tracker to whoever is at home */}
                  {order.status !== "cancelled" ? (
                    <ShareTrackerButton
                      orderId={order.id}
                      phone={order.customer.phone || phone}
                      trackToken={order.trackToken}
                    />
                  ) : null}
                </div>
                {order.customer.note && (
                  <p className="mt-3 text-xs leading-5 text-ink-soft">
                    <strong className="text-ink">{t("track.noteLabel")}</strong>{" "}
                    {order.customer.note}
                  </p>
                )}
              </div>
            </div>

            {/* UX plan §7 — the waiting time is browsing time */}
            {order.status !== "cancelled" ? (
              <div className="-mx-4 sm:-mx-6 lg:-mx-8">
                <WhileYouWaitRail order={order} />
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
