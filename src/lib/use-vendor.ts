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

const useVendorResource = <T,>(
  path: string | null,
  enabled: boolean,
): { data: T | null; loading: boolean; error: string | null; refresh: () => void } => {
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
  return { data, loading, error, refresh };
};

export const useVendorOrders = (enabled: boolean, status = "all") => {
  const res = useVendorResource<{ orders: Order[] }>(
    `/api/vendor/orders?status=${encodeURIComponent(status)}`,
    enabled,
  );
  const advance = useCallback(
    async (orderNo: string, to: string): Promise<Order> => {
      const data = await vendorSend<{ order: Order }>(
        `/api/vendor/orders/${encodeURIComponent(orderNo)}/advance`,
        "POST",
        { to },
      );
      res.refresh();
      return data.order;
    },
    [res],
  );
  return { ...res, orders: res.data?.orders ?? [], advance };
};

export const useVendorOrder = (enabled: boolean, orderNo: string) => {
  const res = useVendorResource<{ order: Order }>(
    orderNo ? `/api/vendor/orders/${encodeURIComponent(orderNo)}` : null,
    enabled,
  );
  return { ...res, order: res.data?.order ?? null };
};

export const useVendorProducts = (enabled: boolean) => {
  const res = useVendorResource<{ products: Product[] }>(
    "/api/vendor/products",
    enabled,
  );
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
      res.refresh();
      return true;
    } catch (err) {
      setSaveError(vendorErrorMessage(err));
      return false;
    }
  }, [res]);

  return { ...res, products: res.data?.products ?? [], saveProduct, saveError };
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
