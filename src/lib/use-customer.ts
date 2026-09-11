"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import {
  __resetCustomerProbe,
  AUTH_SERVER_SNAPSHOT,
  getAuthSnapshot,
  probeCustomerSession,
  subscribeCustomerAuth,
  type CustomerInfo,
} from "./customer-session";

/**
 * Single shared customer-session hook. Probes /api/account/me once per mount
 * cycle; the shared store is observable, so every consumer — the account
 * panel, the wishlist provider, the smart card, the header — flips together
 * the moment signup/login succeeds.
 */
export function useCustomer(): {
  customer: CustomerInfo | null;
  mode: "live" | null;
  checked: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
} {
  const { customer, mode, checked } = useSyncExternalStore(
    subscribeCustomerAuth,
    getAuthSnapshot,
    () => AUTH_SERVER_SNAPSHOT,
  );

  useEffect(() => {
    // Shared promise: concurrent mounts coalesce into one probe.
    void probeCustomerSession();
  }, []);

  const refresh = useCallback(async () => {
    __resetCustomerProbe();
    await probeCustomerSession();
  }, []);

  const signOut = useCallback(async () => {
    await fetch("/api/account/logout", { method: "POST" }).catch(() => {});
    await refresh();
  }, [refresh]);

  return { customer, mode, checked, refresh, signOut };
}
