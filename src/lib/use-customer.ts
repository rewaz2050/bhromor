"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import {
  __resetCustomerProbe,
  AUTH_SERVER_SNAPSHOT,
  demoLogout,
  getAuthSnapshot,
  probeCustomerSession,
  subscribeCustomerAuth,
  type CustomerInfo,
} from "./customer-session";

/**
 * Single shared customer-session hook (the storefront's useStaffLive twin).
 * Probes /api/account/me once per mount cycle; BOTH stores are observable, so
 * every consumer — the account panel, the wishlist provider, the smart card,
 * the header — flips together the moment signup/login succeeds. (Before this
 * lived in per-hook state, a successful live signup left the form on screen:
 * the refresh updated one hook instance while the view read another.)
 */
export function useCustomer(): {
  customer: CustomerInfo | null;
  mode: "live" | "demo" | null;
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
    if (getAuthSnapshot().mode === "live") {
      await fetch("/api/account/logout", { method: "POST" }).catch(() => {});
      await refresh();
    } else {
      demoLogout();
    }
  }, [refresh]);

  return { customer, mode, checked, refresh, signOut };
}
