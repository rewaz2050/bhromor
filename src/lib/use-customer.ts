"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import {
  __resetCustomerProbe,
  demoLogout,
  getCustomerSnapshot,
  getCustomerServerSnapshot,
  probeCustomerSession,
  subscribeCustomerAuth,
  type CustomerInfo,
} from "./customer-session";

/**
 * Single shared customer-session hook (the storefront's useStaffLive twin).
 * Probes /api/account/me once per mount cycle; demo mode reads the
 * browser-local store reactively.
 */
export function useCustomer(): {
  customer: CustomerInfo | null;
  mode: "live" | "demo" | null;
  checked: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
} {
  const demo = useSyncExternalStore(
    subscribeCustomerAuth,
    getCustomerSnapshot,
    getCustomerServerSnapshot,
  );
  const [state, setState] = useState<{
    checked: boolean;
    mode: "live" | "demo" | null;
    liveCustomer: CustomerInfo | null;
  }>({ checked: false, mode: null, liveCustomer: null });

  const probe = useCallback(async () => {
    __resetCustomerProbe();
    const result = await probeCustomerSession();
    setState({
      checked: true,
      mode: result.mode,
      liveCustomer: result.customer,
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    void probeCustomerSession().then((result) => {
      if (!cancelled) {
        setState({
          checked: true,
          mode: result.mode,
          liveCustomer: result.customer,
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const refresh = useCallback(async () => {
    await probe();
  }, [probe]);

  const signOut = useCallback(async () => {
    if (state.mode === "live") {
      await fetch("/api/account/logout", { method: "POST" }).catch(() => {});
      await probe();
    } else {
      demoLogout();
    }
  }, [state.mode, probe]);

  if (state.mode === "demo") {
    return {
      customer: demo.customer,
      mode: "demo",
      checked: state.checked,
      refresh,
      signOut,
    };
  }
  return {
    customer: state.mode === "live" ? state.liveCustomer : null,
    mode: state.mode,
    checked: state.checked,
    refresh,
    signOut,
  };
}
