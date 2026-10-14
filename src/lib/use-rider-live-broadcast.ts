"use client";

/**
 * Rider → customer live position over Supabase Realtime broadcast.
 *
 * The rider's board already PATCHes every fix to `/api/rider/location`; that
 * stays the source of truth (it is what the database, the admin map and the
 * customer's fallback poll all read). This hook additionally *shouts* each fix
 * on the order's broadcast channel, so the customer's pin moves in under a
 * second instead of on the next poll — and the tracker can poll 3× less often
 * while the socket is up.
 *
 * Free by design: broadcast channels need no publication, no table and no
 * migration, and cost nothing at the volumes a Sunamganj shop sees.
 *
 * Fails quiet on purpose. No Supabase keys, a dead socket, an unaccepted job —
 * `publish` simply does nothing and the HTTP path carries the whole feature.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabaseBrowser } from "./supabase-browser";
import { LIVE_FIX_EVENT, type LiveFixPayload } from "./live-fix-event";

export function useRiderLiveBroadcast(opts: {
  /** One channel per live order; the server hands these out in the job feed. */
  channels: (string | null | undefined)[];
  /** Signed in AND online — an offline rider publishes nothing. */
  enabled: boolean;
}): { live: boolean; publish: (lat: number, lng: number) => void } {
  const { enabled } = opts;
  // The board rebuilds its job list on every render, so the channel set is
  // compared by value: this key is what re-arms the sockets, and it only
  // changes when the rider's actual list of live orders changes.
  const channelKey = opts.channels.join("|");
  const names = useMemo(
    () => [...new Set(opts.channels.flatMap((c) => (c ? [c] : [])))].sort(),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by value, see above
    [channelKey],
  );
  const [subscribed, setSubscribed] = useState(false);
  /** Channels currently open. */
  const open = useRef<RealtimeChannel[]>([]);

  useEffect(() => {
    if (!enabled || names.length === 0) return;
    const client = getSupabaseBrowser();
    if (!client) return;
    let cancelled = false;
    let count = 0;
    const channels = names.map((name) =>
      client.channel(name).subscribe((status: string) => {
        if (cancelled) return;
        if (status === "SUBSCRIBED") count += 1;
        setSubscribed(count > 0);
      }),
    );
    open.current = channels;
    return () => {
      cancelled = true;
      count = 0;
      open.current = [];
      setSubscribed(false);
      for (const ch of channels) void client.removeChannel(ch);
    };
  }, [enabled, names]);

  // Derived, not stored: an offline rider with a socket open is not live.
  const live = enabled && names.length > 0 && subscribed;

  const publish = useCallback((lat: number, lng: number) => {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    const payload: LiveFixPayload = { lat, lng, at: Date.now() };
    for (const ch of open.current) {
      // Fire and forget: a broadcast that cannot go out is not an error the
      // rider can act on, and the HTTP upload still carries the fix.
      void ch.send({ type: "broadcast", event: LIVE_FIX_EVENT, payload });
    }
  }, []);

  return { live, publish };
}
