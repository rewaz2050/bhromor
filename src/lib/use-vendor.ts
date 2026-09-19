/**
 * Vendor client layer (marketplace phase 2, slice 3).
 *
 * Typed fetch helpers for /api/vendor/* plus session/data hooks for the
 * /vendor dashboard. The vendor dashboard is live-only: without Supabase
 * there are no vendor accounts, so the UI says so honestly instead of
 * faking a shop.
 */

"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseBrowser } from "./supabase-browser";
import { isSupabaseConfigured } from "./env";
import { usePoll } from "./use-poll";
import type { Category, Product, Shop } from "./catalog";
import type { Order } from "./orders";
import type { VendorEarnings } from "./db/vendor";

export class VendorApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

const readError = async (res: Response): Promise<string> => {
  try {
    const data = (await res.json()) as { error?: string };
    return data.error || "Something went wrong — please try again.";
  } catch {
    return "Something went wrong — please try again.";
  }
};

export const vendorGet = async <T,>(path: string): Promise<T> => {
  let res: Response;
  try {
    res = await fetch(path, { cache: "no-store" });
  } catch {
    throw new VendorApiError("Could not reach the server.", 0);
  }
  if (!res.ok) throw new VendorApiError(await readError(res), res.status);
  return (await res.json()) as T;
};

export const vendorSend = async <T,>(
  path: string,
  method: "POST" | "PATCH",
  body?: unknown,
): Promise<T> => {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new VendorApiError("Could not reach the server.", 0);
  }
  if (!res.ok) throw new VendorApiError(await readError(res), res.status);
  return (await res.json()) as T;
};

export const vendorErrorMessage = (err: unknown): string =>
  err instanceof VendorApiError
    ? err.message
    : "Something went wrong — please try again.";

export interface VendorMe {
  email: string;
  role: "owner" | "staff";
  shop: Shop;
}

/* ------------------------------------------------------------------ */
/* Session                                                             */
/* ------------------------------------------------------------------ */

export const useVendorSession = () => {
  const [me, setMe] = useState<VendorMe | null>(null);
  const [status, setStatus] = useState<"checking" | "authed" | "guest">(
    "checking",
  );
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    if (!isSupabaseConfigured()) {
      setMe(null);
      setStatus("guest");
      return;
    }
    setStatus("checking");
    setError(null);
    try {
      const data = await vendorGet<VendorMe>("/api/vendor/me");
      setMe(data);
      setStatus("authed");
    } catch (err) {
      setMe(null);
      setStatus("guest");
      if (err instanceof VendorApiError && err.status === 403) {
        setError(err.message);
      }
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial session probe on mount
    void refresh();
  }, [refresh]);

  const signIn = useCallback(
    async (email: string, password: string): Promise<string | null> => {
      const client = getSupabaseBrowser();
      if (!client) return "Vendor sign-in needs Supabase to be configured.";
      const { error: authError } = await client.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (authError) return "Email or password did not match.";
      await refresh();
      return null;
    },
    [refresh],
  );

  const signUp = useCallback(
    async (email: string, password: string): Promise<string | null> => {
      const client = getSupabaseBrowser();
      if (!client) return "Vendor sign-up needs Supabase to be configured.";
      const { error: authError } = await client.auth.signUp({
        email: email.trim(),
        password,
      });
      if (authError) return authError.message;
      await refresh();
      return null;
    },
    [refresh],
  );

  const signOut = useCallback(async (): Promise<void> => {
    await getSupabaseBrowser()?.auth.signOut().catch(() => undefined);
    setMe(null);
    setStatus("guest");
  }, []);

  return { me, status, error, refresh, signIn, signUp, signOut };
};

/* ------------------------------------------------------------------ */
/* Data hooks                                                          */
/* ------------------------------------------------------------------ */

/** Vendor order queue refresh while the tab is visible (paused when hidden). */
export const VENDOR_ORDERS_POLL_MS = 20_000;

const useVendorResource = <T,>(
  path: string | null,
  enabled: boolean,
  /** Background refresh cadence in ms; 0 (default) = load once + manual. */
  pollMs = 0,
): {
  data: T | null;
  loading: boolean;
  error: string | null;
  /** Re-read with the loading skeleton (manual retry). */
  refresh: () => void;
  /** Re-read in place — keeps the current rows on screen (after an action). */
  reload: () => void;
} => {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(enabled && path !== null);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!enabled || !path) return;
    let cancelled = false;
    vendorGet<T>(path)
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setError(null);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(vendorErrorMessage(err));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [path, enabled, nonce]);

  const refresh = useCallback(() => {
    setLoading(true);
    setError(null);
    setNonce((n) => n + 1);
  }, []);
  // Background ticks re-read WITHOUT flipping `loading` — the queue must not
  // blink into a skeleton every 20 s while the shop is looking at it. A
  // failed silent tick keeps the last good rows (the next tick retries).
  const silentRefresh = useCallback(() => {
    setNonce((n) => n + 1);
  }, []);
  usePoll(silentRefresh, pollMs, enabled && path !== null && pollMs > 0);
  return { data, loading, error, refresh, reload: silentRefresh };
};

/** POST /api/vendor/orders/[orderNo]/advance — the shop's status move. */
export const advanceVendorOrderRequest = async (
  orderNo: string,
  to: string,
): Promise<Order> => {
  const data = await vendorSend<{ order: Order }>(
    `/api/vendor/orders/${encodeURIComponent(orderNo)}/advance`,
    "POST",
    { to },
  );
  return data.order;
};

/**
 * POST /api/vendor/orders/[orderNo]/payment — the shop's decision on a
 * bKash/Nagad payment (2026-09-18: vendors verify their own wallet money;
 * the database already authorised the owning shop, only the route was
 * missing).
 */
export const decideVendorPaymentRequest = async (
  orderNo: string,
  action: "verified" | "rejected",
  note?: string,
): Promise<Order> => {
  const data = await vendorSend<{ order: Order }>(
    `/api/vendor/orders/${encodeURIComponent(orderNo)}/payment`,
    "POST",
    { action, note },
  );
  return data.order;
};

export const useVendorOrders = (enabled: boolean, status = "all") => {
  // Before 2026-09-18 the vendor queue never refreshed itself: a new order
  // stayed invisible until the shop reloaded the page.
  const res = useVendorResource<{ orders: Order[] }>(
    `/api/vendor/orders?status=${encodeURIComponent(status)}`,
    enabled,
    VENDOR_ORDERS_POLL_MS,
  );
  const { reload } = res;
  const advance = useCallback(
    async (orderNo: string, to: string): Promise<Order> => {
      const order = await advanceVendorOrderRequest(orderNo, to);
      // In-place re-read: the queue must not collapse into a skeleton after
      // every Confirm tap (inline actions, 2026-09-18).
      reload();
      return order;
    },
    [reload],
  );
  return { ...res, orders: res.data?.orders ?? [], advance };
};

export const useVendorOrder = (enabled: boolean, orderNo: string) => {
  // Polls too: once the shop taps Ready the status is moved by dispatch and
  // the rider, and the shop should watch that happen without reloading.
  const res = useVendorResource<{ order: Order }>(
    orderNo ? `/api/vendor/orders/${encodeURIComponent(orderNo)}` : null,
    enabled,
    VENDOR_ORDERS_POLL_MS,
  );
  const { reload } = res;
  const advance = useCallback(
    async (to: string): Promise<Order> => {
      const order = await advanceVendorOrderRequest(orderNo, to);
      reload();
      return order;
    },
    [orderNo, reload],
  );
  const decidePayment = useCallback(
    async (action: "verified" | "rejected", note?: string): Promise<Order> => {
      const order = await decideVendorPaymentRequest(orderNo, action, note);
      reload();
      return order;
    },
    [orderNo, reload],
  );
  return { ...res, order: res.data?.order ?? null, advance, decidePayment };
};

export const useVendorProducts = (enabled: boolean) => {
  const res = useVendorResource<{ products: Product[] }>(
    "/api/vendor/products",
    enabled,
  );
  const { refresh, reload } = res;
  const [saveError, setSaveError] = useState<string | null>(null);

  /** ProductEditor-shaped save: POST for new rows, PATCH for edits. */
  const saveProduct = useCallback(async (
    product: Product,
    isNew: boolean,
  ): Promise<boolean> => {
    setSaveError(null);
    try {
      if (isNew) {
        await vendorSend("/api/vendor/products", "POST", product);
      } else {
        await vendorSend(
          `/api/vendor/products/${encodeURIComponent(product.id)}`,
          "PATCH",
          product,
        );
      }
      refresh();
      return true;
    } catch (err) {
      setSaveError(vendorErrorMessage(err));
      return false;
    }
  }, [refresh]);

  /**
   * One-field shelf change from the list (Publish / Unpublish / Archive /
   * Restore) — a partial PATCH, re-read in place so the list never blinks
   * into a skeleton. Throws the API message for the row to show.
   */
  const patchProduct = useCallback(
    async (
      id: string,
      patch: { status?: "draft" | "published"; active?: boolean },
    ): Promise<void> => {
      await vendorSend(
        `/api/vendor/products/${encodeURIComponent(id)}`,
        "PATCH",
        patch,
      );
      reload();
    },
    [reload],
  );

  return {
    ...res,
    products: res.data?.products ?? [],
    saveProduct,
    saveError,
    patchProduct,
  };
};

export const useVendorCategories = (enabled: boolean) => {
  const res = useVendorResource<{ categories: Category[] }>(
    "/api/vendor/categories",
    enabled,
  );
  return { ...res, categories: res.data?.categories ?? [] };
};

export const useVendorEarnings = (enabled: boolean) => {
  const res = useVendorResource<{ earnings: VendorEarnings }>(
    "/api/vendor/earnings",
    enabled,
  );
  return { ...res, earnings: res.data?.earnings ?? null };
};

export const patchVendorShop = async (patch: Record<string, unknown>): Promise<Shop> => {
  const data = await vendorSend<{ shop: Shop }>("/api/vendor/shop", "PATCH", patch);
  return data.shop;
};
