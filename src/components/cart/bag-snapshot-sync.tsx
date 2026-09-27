"use client";

import { useEffect, useRef } from "react";
import { useCart } from "@/components/cart/cart-provider";
import { useLanguage } from "@/components/i18n/language-provider";
import { bagSignature, readBagTouched, writeBagTouched } from "@/lib/bag-memory";
import { currentSubscription } from "@/lib/push-client";

/**
 * Silent bag memory (UX plan §5, R10). Renders nothing. On every change of
 * the bag's contents it
 *   1. stamps `touchedAt` on this device (the home banner reads it), and
 *   2. when this browser holds a push subscription, tells the server the
 *      bag's shape (count · subtotal · top piece) keyed by that endpoint,
 *      so the scheduler can send ONE reminder ~24 h later. The server keeps
 *      the row only for devices that opted in to offers push; everyone
 *      else's request is a 204 and nothing is stored.
 * An emptied bag (checkout, manual clear) is reported too — count 0 — so
 * no reminder goes out for a bag that no longer exists.
 */
export default function BagSnapshotSync() {
  const { lines, detail, itemCount, subtotal, ready } = useCart();
  const { lang } = useLanguage();
  const lastSig = useRef<string | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (!ready) return;
    const sig = bagSignature(lines);
    if (lastSig.current === null) {
      // First read after hydration: remember the shape, stamp only when the
      // device has never been stamped (an old bag keeps its old time).
      lastSig.current = sig;
      if (lines.length > 0 && readBagTouched() === null) writeBagTouched(Date.now());
      return;
    }
    if (sig === lastSig.current) return;
    lastSig.current = sig;
    writeBagTouched(Date.now());
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      void (async () => {
        const sub = await currentSubscription();
        if (!sub) return;
        const top = detail[0]?.product;
        try {
          await fetch("/api/bag/snapshot", {
            method: "PUT",
            headers: { "content-type": "application/json" },
            keepalive: true,
            body: JSON.stringify({
              endpoint: sub.endpoint,
              count: itemCount,
              subtotal,
              topName: top?.name ?? "",
              topSlug: top?.slug ?? "",
              lang,
            }),
          });
        } catch {
          /* a courtesy — never surfaces */
        }
      })();
    }, 1500);
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
  }, [ready, lines, detail, itemCount, subtotal, lang]);

  return null;
}
