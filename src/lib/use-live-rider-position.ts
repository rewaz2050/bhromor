"use client";

/**
 * The customer's live rider position — one hook, two channels.
 *
 * 1. HTTP: `GET /api/track/rider-location` on mount and then on a timer.
 *    This is the source of truth and the fallback; it works with no socket,
 *    no Realtime and no migration.
 * 2. Realtime: the first HTTP answer carries `liveChannel`, the Supabase
 *    broadcast name the rider's board publishes fixes to. Subscribing makes
 *    the pin move the instant the rider's phone reports instead of on the
 *    next poll — and lets the poll slow right down while the socket is up.
 *
 * Both paths land in the same state, so the map cannot disagree with itself.
 * Nothing is invented: a payload with a non-finite coordinate is dropped, and
 * a fix older than the one already on screen is ignored (a late broadcast
 * must not drag the pin backwards).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { getSupabaseBrowser } from "./supabase-browser";
import { usePoll } from "./use-poll";
import { LIVE_FIX_EVENT } from "./live-fix-event";

/** Poll while relying on HTTP alone. */
export const LIVE_POLL_MS = 10_000;
/** Poll while a realtime socket is up — the backup, not the channel. */
export const BACKUP_POLL_MS = 30_000;

export interface LiveRiderFix {
  lat: number;
  lng: number;
  /** When the rider's phone took the fix, as the server sent it. */
  updatedAt: string;
  /** When this tab read it — the freshness clock can never be behind this. */
  seenAt: number;
}

/** A real coordinate pair, or null. Never `0,0` in the Gulf of Guinea. */
export const asFix = (raw: unknown): { lat: number; lng: number } | null => {
  const p = raw as { lat?: unknown; lng?: unknown } | null;
  const lat = typeof p?.lat === "number" ? p.lat : NaN;
  const lng = typeof p?.lng === "number" ? p.lng : NaN;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
};

interface FixMessage {
  payload?: { lat?: unknown; lng?: unknown; at?: unknown } | null;
}

export function useLiveRiderPosition(opts: {
  orderId: string;
  phone: string;
  /** False until the parcel is actually on the road. */
  enabled: boolean;
}): { rider: LiveRiderFix | null; live: boolean } {
  const { orderId, phone, enabled } = opts;
  const [rider, setRider] = useState<LiveRiderFix | null>(null);
  const [live, setLive] = useState(false);
  // Learned from the first HTTP answer — the channel name is derived from the
  // order number + the stored phone, which only the server may compute.
  const [channel, setChannel] = useState<string | null>(null);
  // Epoch of the newest fix on screen, so a late message cannot rewind the pin.
  const newestAt = useRef<number>(0);

  const accept = useCallback(
    (fix: { lat: number; lng: number }, updatedAt: string, atMs: number) => {
      if (atMs < newestAt.current) return;
      newestAt.current = atMs;
      setRider({ lat: fix.lat, lng: fix.lng, updatedAt, seenAt: Date.now() });
    },
    [],
  );

  /* ---------------- HTTP read ---------------- */
  const fetchRiderPos = useCallback(async () => {
    if (!enabled || !orderId) return;
    try {
      const res = await fetch(
        `/api/track/rider-location?orderId=${encodeURIComponent(orderId)}&phone=${encodeURIComponent(phone)}`,
      );
      const data = (await res.json().catch(() => null)) as {
        lat?: number | null;
        lng?: number | null;
        updatedAt?: string | null;
        liveChannel?: string | null;
      } | null;
      // The channel is offered even on a 404 ("no fix yet"), so the tracker
      // is already listening when the rider's first fix lands.
      if (data?.liveChannel) setChannel((prev) => prev ?? data.liveChannel!);
      if (!res.ok) return;
      const fix = asFix(data);
      if (!fix) return;
      const updatedAt = data?.updatedAt || new Date().toISOString();
      const at = Date.parse(updatedAt);
      accept(fix, updatedAt, Number.isFinite(at) ? at : Date.now());
    } catch {
      /* offline — the next tick or a broadcast will catch up */
    }
  }, [enabled, orderId, phone, accept]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot fetch-on-mount; setState lands after the await
    void fetchRiderPos();
  }, [fetchRiderPos]);

  /* ---------------- Realtime broadcast ---------------- */
  useEffect(() => {
    if (!enabled || !orderId || !channel) return;
    const client = getSupabaseBrowser();
    if (!client) return;
    let cancelled = false;
    const subscription = client
      .channel(channel)
      .on(
        "broadcast",
        { event: LIVE_FIX_EVENT },
        (msg: FixMessage) => {
          const fix = asFix(msg?.payload);
          if (!fix) return;
          const at = typeof msg?.payload?.at === "number" ? msg.payload.at : Date.now();
          accept(fix, new Date(at).toISOString(), at);
        },
      )
      .subscribe((status: string) => {
        if (!cancelled) setLive(status === "SUBSCRIBED");
      });
    return () => {
      cancelled = true;
      setLive(false);
      void client.removeChannel(subscription);
    };
  }, [enabled, orderId, channel, accept]);

  usePoll(fetchRiderPos, live ? BACKUP_POLL_MS : LIVE_POLL_MS, enabled && !!orderId);

  return { rider, live };
}
