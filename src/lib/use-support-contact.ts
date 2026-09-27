"use client";

/**
 * The shop's real WhatsApp support number from ops settings (`/api/contact`),
 * fetched once per page and shared — the search overlay, track page and
 * account already offer a chat button; nothing here invents a number.
 */

import { useEffect, useState } from "react";

let cached: string | null | undefined;
let inflight: Promise<string | null> | null = null;

const load = (): Promise<string | null> => {
  if (cached !== undefined) return Promise.resolve(cached);
  if (!inflight) {
    inflight = (typeof fetch === "function"
      ? fetch("/api/contact", { cache: "no-store" })
          .then((r) => (r.ok ? r.json() : null))
          .then((d: { whatsapp?: string | null } | null) => d?.whatsapp ?? null)
          .catch(() => null)
      : Promise.resolve(null)
    ).then((value) => {
      cached = value;
      inflight = null;
      return value;
    });
  }
  return inflight;
};

/** Test seam — forget the cached number. */
export const __resetSupportContactForTests = (): void => {
  cached = undefined;
  inflight = null;
};

/** `null` until known or when none is configured; `enabled=false` skips the fetch. */
export function useSupportWhatsApp(enabled = true): string | null {
  const [number, setNumber] = useState<string | null>(cached ?? null);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void load().then((value) => {
      if (!cancelled) setNumber(value);
    });
    return () => {
      cancelled = true;
    };
  }, [enabled]);
  return number;
}
