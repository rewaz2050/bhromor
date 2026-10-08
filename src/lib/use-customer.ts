"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { afterFirstPaint } from "./defer";
import {
  __resetCustomerProbe,
  AUTH_SERVER_SNAPSHOT,
  getAuthSnapshot,
  probeCustomerSession,
  seedCustomerSession,
  subscribeCustomerAuth,
  type CustomerInfo,
} from "./customer-session";

/**
 * Single shared customer-session hook. Probes /api/account/me once per mount
 * cycle; the shared store is observable, so every consumer — the account
 * panel, the wishlist provider, the smart card, the header — flips together
 * the moment signup/login succeeds.
 *
 * `initial` is the server's answer for THIS page (see /account). When a page
 * knows it, the first paint carries the real thing — signed-in dashboard or
 * sign-in form — instead of a "checking…" line that is replaced a moment
 * later. The probe still runs afterwards, deferred past the first paint, and
 * may correct the seed (a session that expired in the meantime).
 */
export function useCustomer(initial?: CustomerInfo | null): {
  customer: CustomerInfo | null;
  mode: "live" | null;
  checked: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
} {
  const store = useSyncExternalStore(
    subscribeCustomerAuth,
    getAuthSnapshot,
    () => AUTH_SERVER_SNAPSHOT,
  );

  useEffect(() => {
    // Hand the server's answer to the shared store before the probe can
    // resolve, so every other consumer on the page agrees with it.
    if (initial !== undefined) seedCustomerSession(initial);
    // Shared promise: concurrent mounts coalesce into one probe. Deferred
    // past the first paint (P2.5) — the session badge is not what a visitor
    // is waiting for; the hero and the product grid are.
    return afterFirstPaint(() => void probeCustomerSession());
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `initial` is a mount-time fact
  }, []);

  // Until the store has an answer of its own, the server's answer stands.
  // It is the same value on the server render and on hydration, so nothing
  // is repaired (and nothing flickers) when React takes over.
  const seeded = initial !== undefined && !store.checked;

  const refresh = useCallback(async () => {
    __resetCustomerProbe();
    await probeCustomerSession();
  }, []);

  const signOut = useCallback(async () => {
    await fetch("/api/account/logout", { method: "POST" }).catch(() => {});
    await refresh();
  }, [refresh]);

  return {
    customer: seeded ? initial : store.customer,
    mode: seeded ? (initial ? ("live" as const) : null) : store.mode,
    checked: seeded ? true : store.checked,
    refresh,
    signOut,
  };
}
