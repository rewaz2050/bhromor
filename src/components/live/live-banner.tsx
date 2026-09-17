"use client";

/**
 * Home-page live shopping banner (P1 #9).
 *
 * Shows only when something real is happening: a LIVE session (the shop has
 * tapped Start) or a scheduled session starting within 48 hours. Fetches
 * /api/live once and re-checks every 60s; any failure = no banner, never a
 * fake LIVE.
 */

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { IconArrowRight, IconClock } from "@/components/ui/icons";
import { liveState, type LiveSession } from "@/lib/live";
import { afterFirstPaint } from "@/lib/defer";

interface LiveData {
  live: LiveSession | null;
  upcoming: LiveSession | null;
}

const SOON_MS = 48 * 3600 * 1000;

const fmtWhen = (ms: number): string =>
  new Date(ms).toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

export default function LiveBanner() {
  // fetchedAt is part of the state so the "starting soon" window is judged
  // against the poll's own timestamp — pure at render, fresh every 60s.
  const [data, setData] = useState<(LiveData & { fetchedAt: number }) | null>(
    null,
  );

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/live", { cache: "no-store" });
      if (!res.ok) return; // unconfigured → no banner
      const json = (await res.json()) as LiveData;
      setData({
        live: json.live ?? null,
        upcoming: json.upcoming ?? null,
        fetchedAt: Date.now(),
      });
    } catch {
      // network blip — keep whatever we had (or nothing)
    }
  }, []);

  useEffect(() => {
    // First read after the first paint (P2.5), then every 60 s.
    const cancel = afterFirstPaint(() => void load());
    const t = setInterval(() => void load(), 60_000);
    return () => {
      cancel();
      clearInterval(t);
    };
  }, [load]);

  const live = data?.live && liveState(data.live) === "live" ? data.live : null;
  const upcoming =
    !live &&
    data?.upcoming &&
    data.upcoming.scheduledStart - data.fetchedAt <= SOON_MS
      ? data.upcoming
      : null;

  if (!live && !upcoming) return null;

  if (live) {
    return (
      <Link
        href="/live"
        className="group relative block overflow-hidden bg-red-700 px-4 py-2.5 text-center"
      >
        <span className="relative inline-flex items-center gap-2 text-[0.68rem] font-bold uppercase tracking-[0.16em] text-white sm:text-[0.7rem]">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
          Live now — {live.title} — watch &amp; shop
          <IconArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
        </span>
      </Link>
    );
  }

  return (
    <Link
      href="/live"
      className="group relative block overflow-hidden border-b border-gold-300/20 bg-[linear-gradient(90deg,#0c1913_0%,#143122_50%,#0c1913_100%)] px-4 py-2.5 text-center"
    >
      <span className="relative inline-flex items-center gap-2 text-[0.66rem] font-[550] tracking-[0.14em] text-ivory-100/90 sm:text-[0.68rem]">
        <IconClock className="h-3 w-3 text-gold-400" />
        Live shopping {fmtWhen(upcoming!.scheduledStart)} —{" "}
        {upcoming!.products.length}{" "}
        {upcoming!.products.length === 1 ? "piece" : "pieces"} — get ready
        <IconArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}
