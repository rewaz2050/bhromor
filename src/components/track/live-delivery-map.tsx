"use client";

import { formatShopDate } from "@/lib/format";
import { useState } from "react";
import { courierEta, isCourierZone } from "@/lib/delivery";
import { riderDistance } from "@/lib/rider-distance";
import { bnDigits } from "@/lib/arrival";
import { useLanguage } from "@/components/i18n/language-provider";
import { freshnessLabel, locationFreshness } from "@/lib/location-health";
import { useNow } from "@/lib/use-now";
import { LIVE_POLL_MS, useLiveRiderPosition } from "@/lib/use-live-rider-position";
import type { Order } from "@/lib/orders";
import { displayedDeliveryCode } from "@/lib/orders";
import {
  IconMapPin,
  IconPhone,
  IconShield,
  IconTruck,
} from "@/components/ui/icons";
import { RiderTileMap } from "./rider-tile-map";

interface LiveDeliveryMapProps {
  order: Order;
}

export function LiveDeliveryMap({ order }: LiveDeliveryMapProps) {
  const { t, lang } = useLanguage();
  const digits = (n: number | string) => (lang === "bn" ? bnDigits(String(n)) : String(n));
  const isDelivered = order.status === "delivered";
  const isCancelled = order.status === "cancelled";
  const isOut = order.status === "out-for-delivery";
  const isAssigned = order.status === "courier-assigned" || order.status === "ready-for-pickup";
  const isPreparing = order.status === "preparing" || order.status === "confirmed" || order.status === "pending";

  const deliveryCode = displayedDeliveryCode(order.deliveryCode);

  // Progress is a STATUS-based position on the schematic route (pending →
  // assigned → on the way → delivered). It is NOT a GPS claim: when a real
  // rider position is available it is shown as the "Rider live" coordinates
  // in the ETA card, and nothing here animates invented movement.
  const baseProgress = isDelivered ? 1 : isOut ? 0.65 : isAssigned ? 0.25 : 0.05;
  // Q: how old the rider's last fix is — a stale pin must not pose as live.
  const clock = useNow(30_000);

  // Real rider position while the parcel is on the road: HTTP on mount and
  // then on a timer, plus the rider's Realtime broadcast once the first read
  // hands back a channel name (`lib/use-live-rider-position`). Polling stays
  // the fallback — no socket, no keys, no migration and it still works.
  const { rider: riderLive, live } = useLiveRiderPosition({
    orderId: order.id,
    phone: order.customer.phone,
    trackToken: order.trackToken,
    enabled: isOut && !!order.id,
  });
  // The tile map is progressive enhancement: if Leaflet cannot load (offline,
  // blocked CDN) the schematic below takes over instead of a blank rectangle.
  const [tileMapFailed, setTileMapFailed] = useState(false);

  const transitProgress = Math.min(1, Math.max(0, baseProgress));

  // Coordinates along a curved SVG path (viewBox 0 0 600 280)
  // Shop at (80, 200), Customer at (520, 75)
  // Bezier curve: M 80,200 C 200,240 320,80 520,75
  const getPointOnCurve = (t: number) => {
    // Cubic bezier formula: B(t) = (1-t)^3*P0 + 3(1-t)^2*t*P1 + 3(1-t)*t^2*P2 + t^3*P3
    const p0 = { x: 80, y: 200 };
    const p1 = { x: 220, y: 250 };
    const p2 = { x: 340, y: 80 };
    const p3 = { x: 520, y: 75 };

    const u = 1 - t;
    const tt = t * t;
    const uu = u * u;
    const uuu = uu * u;
    const ttt = tt * t;

    const x = uuu * p0.x + 3 * uu * t * p1.x + 3 * u * tt * p2.x + ttt * p3.x;
    const y = uuu * p0.y + 3 * uu * t * p1.y + 3 * u * tt * p2.y + ttt * p3.y;

    return { x, y };
  };

  const riderPos = getPointOnCurve(transitProgress);

  // UX plan §7 — how far, how long: only from a real rider fix and a real
  // delivery pin; never while delivered.
  const fresh = riderLive ? locationFreshness(riderLive.updatedAt, Math.max(clock, riderLive.seenAt)) : null;
  const away = riderLive && !isDelivered && fresh?.level !== "stale" ? riderDistance(riderLive, order, lang) : null;

  // A real rider comes from the dispatch data — nothing is invented here:
  // no fake name, no invented phone, no made-up rating.
  const rider = order.rider;
  const riderRating =
    rider?.ratingCount != null && rider.ratingCount > 0
      ? `${rider.ratingAvg.toFixed(1)} ★`
      : null;

  // P1 #8 — the payment row must say what this order actually pays.
  const paymentLabel =
    order.payment === "bkash"
      ? t("checkout.livePayBkash")
      : order.payment === "nagad"
        ? t("checkout.livePayNagad")
        : t("checkout.livePayCod");

  // A real map needs a real coordinate. With neither a delivery pin from
  // checkout nor a rider fix there is nothing honest to draw, so the
  // schematic below stands in.
  const destination =
    typeof order.lat === "number" && typeof order.lng === "number"
      ? { lat: order.lat, lng: order.lng }
      : null;
  const riderPoint = riderLive ? { lat: riderLive.lat, lng: riderLive.lng } : null;
  const showTileMap = !tileMapFailed && (destination !== null || riderPoint !== null);

  return (
    <div className="overflow-hidden rounded-3xl border border-line bg-paper shadow-sm" data-testid="live-delivery-map">
      {/* Map surface: the customer's own neighbourhood, the rider's pin on it,
          and the line between the two — Leaflet + OpenStreetMap, no API key. */}
      <div
        className="relative h-80 w-full overflow-hidden bg-forest-950 sm:h-96"
        data-testid={showTileMap ? "track-map-tiles" : "track-map-schematic"}
      >
        {showTileMap && (
          <RiderTileMap
            destination={destination}
            rider={riderPoint}
            stale={fresh?.level === "stale"}
            destinationLabel={order.customer.area}
            riderLabel={rider?.name ?? t("checkout.liveRiderFallback")}
            onFailed={() => setTileMapFailed(true)}
          />
        )}

        {/* Fallback surface — also what renders before the first coordinate. */}
        <div className={showTileMap ? "hidden" : "absolute inset-0"}>
        {/* Subtle Map Grid Background */}
        <div className="absolute inset-0 opacity-20 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]" />

        {/* Decorative City Landforms / Zones */}
        <svg
          viewBox="0 0 600 280"
          className="absolute inset-0 h-full w-full select-none"
          aria-hidden="true"
        >
          {/* Secondary streets */}
          <path
            d="M 30,50 L 570,90 M 120,20 L 100,260 M 380,30 L 410,250 M 50,160 L 550,180"
            stroke="#1c362b"
            strokeWidth="3"
            fill="none"
          />

          {/* Planned Delivery Route Glow */}
          <path
            d="M 80,200 C 220,250 340,80 520,75"
            stroke="#c99738"
            strokeWidth="8"
            strokeLinecap="round"
            fill="none"
            opacity="0.25"
          />

          {/* Active Animated Route Line */}
          <path
            d="M 80,200 C 220,250 340,80 520,75"
            stroke="#e6c374"
            strokeWidth="3.5"
            strokeDasharray="6 8"
            strokeLinecap="round"
            fill="none"
            className={isOut ? "animate-pulse" : ""}
          />

          {/* Point A: Shop / Hub Marker */}
          <g transform="translate(80, 200)">
            <circle r="14" fill="#142c22" stroke="#e6c374" strokeWidth="2" />
            <circle r="6" fill="#e6c374" />
          </g>

          {/* Point B: Customer Destination Marker */}
          <g transform="translate(520, 75)">
            <circle r="18" fill="#142c22" stroke="#22c55e" strokeWidth="2" />
            <circle r="7" fill="#22c55e" className="animate-ping opacity-75" />
            <circle r="7" fill="#22c55e" />
          </g>

          {/* Moving Rider Vehicle */}
          {!isCancelled && (
            <g
              transform={`translate(${riderPos.x}, ${riderPos.y})`}
              className="transition-all duration-1000 ease-linear"
            >
              {/* Pulsing beacon wave */}
              <circle r="16" fill="#f59e0b" opacity="0.3" className="animate-ping" />
              <circle r="12" fill="#d97706" stroke="#ffffff" strokeWidth="2" />
              {/* Small vehicle icon representation */}
              <circle r="4" fill="#ffffff" />
            </g>
          )}
        </svg>
        </div>

        {/* Floating Map Badges */}
        <div className="absolute left-4 top-4 flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 rounded-full bg-forest-900/95 px-3.5 py-1.5 text-xs font-semibold text-ivory-50 ring-1 ring-white/10">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            {isDelivered
              ? t("checkout.liveStatusDelivered")
              : isOut
              ? t("checkout.liveStatusOnWay")
              : isAssigned
              ? t("checkout.liveStatusHub")
              : t("checkout.liveStatusPreparing")}
          </div>
          {/* How fresh the pin is, in plain words: a live socket, or the poll
              interval. Never a claim the tracker cannot keep. */}
          {isOut && !isDelivered && (
            <span
              data-testid={live ? "track-live-socket" : "track-live-poll"}
              className="rounded-full bg-forest-900/95 px-3 py-1.5 text-[11px] font-semibold text-ivory-100 ring-1 ring-white/10"
            >
              {live ? t("checkout.liveTrackingOn") : t("checkout.liveEvery").replace("{sec}", digits(LIVE_POLL_MS / 1000))}
            </span>
          )}
        </div>

        {/* Live ETA Card overlay */}
        <div className="absolute right-4 top-4 rounded-2xl bg-forest-900/95 p-3 text-right text-ivory-50 ring-1 ring-white/10">
          <p className="text-[10px] uppercase tracking-wider text-ivory-100/70">
            {t("checkout.liveEtaLabel")}
          </p>
          <p className="font-display text-base font-bold text-gold-300 sm:text-lg">
            {isDelivered
              ? t("checkout.liveEtaDelivered")
              : isCancelled
              ? t("checkout.liveEtaCancelled")
              : isOut
              ? t("checkout.liveEtaOnWay")
              : isCourierZone(order.zoneId) && !order.isPickup
                ? courierEta("bn")
                : order.etaLabel}
          </p>
          {riderLive && (
            <p className="mt-1 text-[10px] text-emerald-300"><IconMapPin className="mr-0.5 inline h-3 w-3 align-[-2px]" />Rider live {riderLive.lat.toFixed(4)},{riderLive.lng.toFixed(4)} · {formatShopDate(riderLive.updatedAt, { hour: "2-digit", minute: "2-digit" })}{fresh && fresh.level !== "unknown" ? ` (${freshnessLabel(fresh)})` : ""}</p>
          )}
          {riderLive && !isDelivered && fresh?.level === "stale" && (
            <p data-testid="rider-stale" className="mt-1 text-[11px] font-semibold text-amber-200">
              {t("checkout.liveStaleNote").replace("{min}", digits(fresh.minutes ?? 0))}
            </p>
          )}
          {/* UX plan §7 — the number a family actually wants: how far, how
              long. Only from a real rider fix and a real delivery pin. */}
          {away ? (
            <p data-testid="rider-away" className="mt-1 text-[11px] font-semibold text-ivory-50">
              {t("checkout.liveAway").replace("{distance}", away.distanceLabel).replace("{min}", digits(away.minutes))}
            </p>
          ) : null}
        </div>

        {/* Destination Chip on Map Bottom Right */}
        <div className="absolute bottom-3 right-4 flex items-center gap-1.5 rounded-full bg-forest-900/90 px-3 py-1 text-xs text-ivory-100 ring-1 ring-white/10">
          <IconMapPin className="h-3.5 w-3.5 text-emerald-400" />
          <span className="truncate max-w-[180px]">{order.customer.area}</span>
        </div>
      </div>

      {/* Control & Security Panel */}
      <div className="p-5 sm:p-6">
        <div className="grid gap-6 sm:grid-cols-2">
          {/* Security Delivery PIN Section */}
          <div className="rounded-2xl bg-ivory-100/80 p-4 ring-1 ring-line">
            <div className="flex items-center gap-2">
              <IconShield className="h-5 w-5 text-gold-600" />
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-forest-900">
                  {t("checkout.liveSecurePin")}
                </p>
                <p className="text-[11px] text-ink-soft">
                  {t("checkout.liveSecurePinHint")}
                </p>
              </div>
            </div>

            {order.deliveryCode ? (
              <div className="mt-3 flex items-center justify-center gap-2">
              {deliveryCode.split("").map((digit, index) => (
                <span
                  key={index}
                  className="flex h-11 w-10 items-center justify-center rounded-xl bg-paper font-mono text-xl font-bold text-forest-900 shadow-sm ring-1 ring-line"
                >
                  {digit}
                </span>
              ))}
              </div>
            ) : (
              <p className="mt-3 text-sm leading-6 text-ink-soft">
                {lang === "bn"
                  ? "PIN দেখতে অর্ডার কনফার্মেশনের ট্র্যাকিং লিংক খুলুন, অথবা এই ডিভাইসে সংরক্ষিত শেষ অর্ডার ব্যবহার করুন। শুধু অর্ডার ID ও ফোন দিয়ে PIN দেখা যাবে না।"
                  : "Open the tracking link from your order confirmation, or use the last order saved on this device, to see your PIN. Order ID and phone alone do not reveal it."}
              </p>
            )}

            {order.deliveryCode ? (
              <p className="mt-2.5 text-center text-[11px] font-medium text-emerald-700">
                {t("checkout.liveNoSmsTrust")}
              </p>
            ) : null}
          </div>

          {/* Assigned Rider Info */}
          <div className="flex flex-col justify-between rounded-2xl bg-ivory-100/80 p-4 ring-1 ring-line">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-forest-800 text-ivory-50 shadow-sm">
                  <IconTruck className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-xs font-semibold text-ink-soft uppercase tracking-wider">
                    {t("checkout.liveAssignedRider")}
                  </p>
                  <p className="text-sm font-bold text-forest-900">
                    {isPreparing || !rider
                      ? t("checkout.liveRiderSearching")
                      : rider.name}
                  </p>
                  <p className="text-xs text-ink-soft">
                    {isPreparing
                      ? t("checkout.liveShopPacking")
                      : rider
                        ? riderRating
                          ? t("checkout.liveBikeRating").replace("{rating}", riderRating)
                          : t("checkout.liveBike")
                        : t("checkout.liveRiderAwaitName")}
                  </p>
                  {/* UX plan §7 (post-purchase pass 2026-10-06): the number a
                      family actually wants — how far, how long — belongs next
                      to the rider's name, not only in the map's ETA corner.
                      A stale fix gets the honest "last position" line instead. */}
                  {away && !isDelivered ? (
                    <p
                      data-testid="rider-card-away"
                      className="mt-1 text-[11px] font-semibold text-emerald-700"
                    >
                      {t("checkout.liveAway").replace("{distance}", away.distanceLabel).replace("{min}", digits(away.minutes))}
                    </p>
                  ) : riderLive && fresh?.level === "stale" ? (
                    <p className="mt-1 text-[11px] text-amber-700">
                      {t("checkout.liveLastPosition").replace("{when}", freshnessLabel(fresh))}
                    </p>
                  ) : null}
                </div>
              </div>

              {!isPreparing && !!rider && !!rider.phone && !isDelivered && !isCancelled && (
                <a
                  href={`tel:${rider.phone}`}
                  className="inline-flex items-center gap-1.5 rounded-full bg-forest-800 px-3.5 py-1.5 text-xs font-semibold text-ivory-50 transition-colors hover:bg-forest-900"
                >
                  <IconPhone className="h-3.5 w-3.5" /> {t("checkout.liveCallRider")}
                </a>
              )}
            </div>

            <div className="mt-3 flex items-center justify-between border-t border-line/60 pt-2 text-[11px] text-ink-soft">
              <span>{t("checkout.liveZone")} <strong>{order.zoneName}</strong></span>
              <span>{t("checkout.livePaymentRow")} <strong>{paymentLabel}</strong></span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
