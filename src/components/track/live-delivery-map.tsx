"use client";

import { useEffect, useState } from "react";
import type { Order } from "@/lib/orders";
import { getDeliveryCode } from "@/lib/orders";
import { IconMapPin, IconPhone, IconShield, IconTruck } from "@/components/ui/icons";

interface RiderLivePos {
  lat: number;
  lng: number;
  updatedAt: string;
}

interface LiveDeliveryMapProps {
  order: Order;
}

export function LiveDeliveryMap({ order }: LiveDeliveryMapProps) {
  const isDelivered = order.status === "delivered";
  const isCancelled = order.status === "cancelled";
  const isOut = order.status === "out-for-delivery";
  const isAssigned = order.status === "courier-assigned" || order.status === "ready-for-pickup";
  const isPreparing = order.status === "preparing" || order.status === "confirmed" || order.status === "pending";

  const deliveryCode = order.deliveryCode ?? getDeliveryCode(order.id);

  // Derive base progress and animate subtle simulated motion when active
  const baseProgress = isDelivered ? 1 : isOut ? 0.65 : isAssigned ? 0.25 : 0.05;
  const [liveOffset, setLiveOffset] = useState(0);
  const [riderLive, setRiderLive] = useState<RiderLivePos | null>(null);

  useEffect(() => {
    if (!isOut) return;
    const interval = setInterval(() => {
      setLiveOffset((prev) => (prev >= 0.18 ? -0.15 : prev + 0.03));
    }, 2500);
    return () => clearInterval(interval);
  }, [isOut]);

  // Free real rider location polling (no cost, uses existing rider/location API)
  useEffect(() => {
    if (!isOut || !order.id) return;
    let cancelled = false;
    const fetchRiderPos = async () => {
      try {
        const res = await fetch(`/api/track/rider-location?orderId=${encodeURIComponent(order.id)}`);
        if (!res.ok) return;
        const data = await res.json().catch(() => null) as any;
        if (data?.lat && data?.lng && !cancelled) {
          setRiderLive({ lat: data.lat, lng: data.lng, updatedAt: data.updatedAt || new Date().toISOString() });
        }
      } catch {}
    };
    void fetchRiderPos();
    const id = window.setInterval(fetchRiderPos, 15000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [isOut, order.id]);

  const transitProgress = Math.min(1, Math.max(0, baseProgress + (isOut ? liveOffset : 0)));

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

  // Live orders carry the assigned rider; older rows keep the mock so
  // the editorial preview still has a rider to show.
  const riderName =
    order.rider?.name ?? "তানভীর আহমেদ (Tanvir)";
  const riderPhone = order.rider?.phone ?? "01811111111";
  const riderRating =
    order.rider?.ratingCount != null && order.rider.ratingCount > 0
      ? `${order.rider.ratingAvg.toFixed(1)} ★`
      : "4.9 ★";

  return (
    <div className="overflow-hidden rounded-3xl border border-line bg-paper shadow-sm" data-testid="live-delivery-map">
      {/* Map Graphic Container */}
      <div className="relative h-64 w-full overflow-hidden bg-forest-950 sm:h-72">
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

        {/* Floating Map Badges */}
        <div className="absolute left-4 top-4 flex items-center gap-2 rounded-full bg-forest-900/90 px-3.5 py-1.5 text-xs font-semibold text-ivory-50 backdrop-blur-md ring-1 ring-white/10">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          {isDelivered
            ? "ডেলিভারি সম্পন্ন (Delivered)"
            : isOut
            ? "রাইডার আপনার পথে (On the way)"
            : isAssigned
            ? "রাইডার দোকানে উপস্থিত হচ্ছে (Heading to Hub)"
            : "অর্ডার প্রস্তুত হচ্ছে (Preparing)"}
        </div>

        {/* Live ETA Card overlay */}
        <div className="absolute right-4 top-4 rounded-2xl bg-forest-900/90 p-3 text-right text-ivory-50 backdrop-blur-md ring-1 ring-white/10">
          <p className="text-[10px] uppercase tracking-wider text-ivory-100/70">
            আনুমানিক সময় (ETA)
          </p>
          <p className="font-display text-base font-bold text-gold-300 sm:text-lg">
            {isDelivered
              ? "ডেলিভার্ড ✓"
              : isCancelled
              ? "বাতিল"
              : isOut
              ? "১০–১৫ মিনিট বাকি"
              : order.etaLabel}
          </p>
          {riderLive && (
            <p className="mt-1 text-[10px] text-emerald-300">📍 Rider live {riderLive.lat.toFixed(4)},{riderLive.lng.toFixed(4)} · {new Date(riderLive.updatedAt).toLocaleTimeString()}</p>
          )}
        </div>

        {/* Destination Chip on Map Bottom Right */}
        <div className="absolute bottom-3 right-4 flex items-center gap-1.5 rounded-full bg-forest-900/80 px-3 py-1 text-xs text-ivory-100 backdrop-blur-sm ring-1 ring-white/10">
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
                  নিরাপদ ডেলিভারি কোড (Security PIN)
                </p>
                <p className="text-[11px] text-ink-soft">
                  রাইডার পার্সেল দিলে এই ৪-ডিজিটের কোডটি বলুন
                </p>
              </div>
            </div>

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

            <p className="mt-2.5 text-center text-[11px] font-medium text-emerald-700">
              🔒 এসএমএস ছাড়াই শতভাগ নিশ্চিত ও ফেক-ডেলিভারি মুক্ত প্রমাণ
            </p>
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
                    অ্যাসাইন্ড রাইডার
                  </p>
                  <p className="text-sm font-bold text-forest-900">
                    {isPreparing ? "রাইডার খোঁজা হচ্ছে…" : riderName}
                  </p>
                  <p className="text-xs text-ink-soft">
                    {isPreparing ? "দোকান প্যাক করছে" : `বাইক • রেটিং ${riderRating}`}
                  </p>
                </div>
              </div>

              {!isPreparing && !isDelivered && !isCancelled && (
                <a
                  href={`tel:${riderPhone}`}
                  className="inline-flex items-center gap-1.5 rounded-full bg-forest-800 px-3.5 py-1.5 text-xs font-semibold text-ivory-50 transition-colors hover:bg-forest-900"
                >
                  <IconPhone className="h-3.5 w-3.5" /> কল দিন
                </a>
              )}
            </div>

            <div className="mt-3 flex items-center justify-between border-t border-line/60 pt-2 text-[11px] text-ink-soft">
              <span>ডেলিভারি জোন: <strong>{order.zoneName}</strong></span>
              <span>পেমেন্ট: <strong>ক্যাশ অন ডেলিভারি (COD)</strong></span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
