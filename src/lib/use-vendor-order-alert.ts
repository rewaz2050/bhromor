"use client";

/**
 * "A new order must not be missed" (2026-09-27, Phase 2 — dashboard).
 *
 * The staff panel has rung for new orders since 2026-09-24; the vendor
 * dashboard only polled silently, so a shop owner who was not staring at
 * the screen found out from the customer's phone call instead. This hook
 * watches the same 20-second order poll the dashboard already runs and,
 * when an order it has never seen appears:
 *
 *   • beeps (WebAudio — unlocked by the shop's first tap on the page),
 *   • vibrates where the browser allows it,
 *   • shows a system notification through the service worker (the only
 *     constructor that works on mobile Chrome — `new Notification()` is an
 *     illegal constructor there).
 *
 * Honesty rules, same as the staff card: permission is asked ONLY from the
 * shop's own tap (`enableAlerts`), never on mount — an untapped prompt is
 * auto-denied and `denied` is sticky. The first payload after a load never
 * rings; nothing is "new" until it arrives after the page was watching.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { Order } from "./orders";
import { newOrderIds } from "./vendor-dashboard";
import { showPanelNotice } from "./push-client";
import { createBeep } from "./panel-beep";

/** Remembered per browser: this shop wants the ring. */
export const VENDOR_ALERT_KEY = "prosanti.vendor-alerts.v1";

const readArmed = (): boolean => {
  try {
    return window.localStorage.getItem(VENDOR_ALERT_KEY) === "on";
  } catch {
    return false;
  }
};

const writeArmed = (on: boolean): void => {
  try {
    if (on) window.localStorage.setItem(VENDOR_ALERT_KEY, "on");
    else window.localStorage.removeItem(VENDOR_ALERT_KEY);
  } catch {
    // Private mode: the session still rings, it just forgets.
  }
};

export interface VendorAlertState {
  permission: NotificationPermission | "unsupported";
  /** The shop turned the ring on (sound; notification too when allowed). */
  armed: boolean;
  /** When the last alert fired, for the "rang 2 min ago" line. */
  lastRangAt: number | null;
  /** Orders counted since the page opened — proof the watcher is alive. */
  seen: number;
}

export interface UseVendorOrderAlert {
  state: VendorAlertState;
  /** Runs from a tap: asks permission, unlocks audio, remembers the choice. */
  enableAlerts: () => Promise<void>;
  disableAlerts: () => void;
  /** Play the sound + a notification now, so the shop can test it. */
  testAlert: () => Promise<void>;
}

export function useVendorOrderAlert(
  orders: Order[],
  opts: { enabled: boolean; shopName?: string },
): UseVendorOrderAlert {
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(() =>
    typeof window !== "undefined" && "Notification" in window
      ? Notification.permission
      : "unsupported",
  );
  const [armed, setArmed] = useState(false);
  const [lastRangAt, setLastRangAt] = useState<number | null>(null);
  const [seen, setSeen] = useState(0);

  const beep = useRef(createBeep());
  const known = useRef<Set<string>>(new Set());
  const primed = useRef(false);

  // Unlock the audio graph on the shop's first tap anywhere on the page —
  // an Android Chrome tab that never had a gesture cannot play the beep.
  useEffect(() => {
    const unlock = () => beep.current.unlock();
    window.addEventListener("pointerdown", unlock, { passive: true });
    return () => window.removeEventListener("pointerdown", unlock);
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- the stored choice is per browser
  useEffect(() => setArmed(readArmed()), []);

  const ring = useCallback(
    (order: Order) => {
      beep.current.play();
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        try {
          (
            navigator as Navigator & { vibrate?: (pattern: number | number[]) => boolean }
          ).vibrate?.([200, 100, 200]);
        } catch {
          // vibration is a bonus
        }
      }
      const where = `/vendor/orders/${encodeURIComponent(order.id)}`;
      void showPanelNotice(
        `New order ${order.id}`,
        `${order.customer?.name ?? "Customer"} · ${order.items?.length ?? 0} item(s) · confirm it now`,
        where,
      );
      setLastRangAt(Date.now());
    },
    [],
  );

  useEffect(() => {
    if (!opts.enabled) return;
    const ids = orders.map((o) => o.id);
    if (!primed.current) {
      primed.current = true;
      known.current = new Set(ids);
      setSeen(ids.length);
      return;
    }
    const fresh = newOrderIds([...known.current], orders);
    for (const id of ids) known.current.add(id);
    setSeen(known.current.size);
    if (fresh.length === 0) return;
    const latest = orders.find((o) => o.id === fresh[fresh.length - 1]);
    if (!latest) return;
    // Ring only when the shop asked for it; the first order after enabling
    // is the "test" the card describes.
    if (armed && (permission === "granted" || permission === "unsupported")) {
      ring(latest);
    }
  }, [orders, armed, permission, opts.enabled, ring]);

  const enableAlerts = useCallback(async () => {
    beep.current.unlock();
    if (typeof window !== "undefined" && "Notification" in window) {
      try {
        const next = await Notification.requestPermission();
        setPermission(next);
        // The initial probe deliberately skips a ring; from now on, ring.
        writeArmed(true);
        setArmed(true);
        return;
      } catch {
        // Fall through: sound still works without notification permission.
      }
    }
    setPermission("unsupported");
    writeArmed(true);
    setArmed(true);
  }, []);

  const disableAlerts = useCallback(() => {
    writeArmed(false);
    setArmed(false);
  }, []);

  const testAlert = useCallback(async () => {
    beep.current.play();
    await showPanelNotice(
      "PROSANTI test alert",
      opts.shopName ? `${opts.shopName} — new orders will ring like this.` : "New orders will ring like this.",
      "/vendor/orders",
    );
  }, [opts.shopName]);

  return {
    state: { permission, armed, lastRangAt, seen },
    enableAlerts,
    disableAlerts,
    testAlert,
  };
}
