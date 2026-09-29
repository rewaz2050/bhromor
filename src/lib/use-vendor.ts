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

/** Why a signed-in user was refused (mirrors VendorDenyReason server-side). */
export type VendorDenyReason = "none" | "pending" | "suspended" | "rejected";

export class VendorApiError extends Error {
  status: number;
  reason?: VendorDenyReason;
  constructor(message: string, status: number, reason?: VendorDenyReason) {
    super(message);
    this.status = status;
    this.reason = reason;
  }
}

const FALLBACK = "Something went wrong — please try again.";

const readError = async (
  res: Response,
): Promise<{ message: string; reason?: VendorDenyReason }> => {
  try {
    const data = (await res.json()) as { error?: string; reason?: string };
    const reason =
      data.reason === "pending" || data.reason === "suspended" || data.reason === "rejected" || data.reason === "none"
        ? data.reason
        : undefined;
    return { message: data.error || FALLBACK, reason };
  } catch {
    return { message: FALLBACK };
  }
};

export const vendorGet = async <T,>(path: string): Promise<T> => {
  let res: Response;
  try {
    res = await fetch(path, { cache: "no-store" });
  } catch {
    throw new VendorApiError("Could not reach the server.", 0);
  }
  if (!res.ok) {
    const { message, reason } = await readError(res);
    throw new VendorApiError(message, res.status, reason);
  }
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
  if (!res.ok) {
    const { message, reason } = await readError(res);
    throw new VendorApiError(message, res.status, reason);
  }
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

/**
 * Session probe for the vendor dashboard. `status` is "guest" both for a
 * signed-out visitor and for a signed-in account the API refused; the
 * latter also carries `error` (+ `denyReason` — "pending" while the shop
 * application awaits approval, since apply = sign up as of 2026-09-26) so
 * the login page can show what to do next instead of a blank form.
 */
export const useVendorSession = () => {
  const [me, setMe] = useState<VendorMe | null>(null);
  const [status, setStatus] = useState<"checking" | "authed" | "guest">(
    "checking",
  );
  const [error, setError] = useState<string | null>(null);
  const [denyReason, setDenyReason] = useState<VendorDenyReason | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    if (!isSupabaseConfigured()) {
      setMe(null);
      setStatus("guest");
      return;
    }
    setStatus("checking");
    setError(null);
    setDenyReason(null);
    try {
      const data = await vendorGet<VendorMe>("/api/vendor/me");
      setMe(data);
      setStatus("authed");
    } catch (err) {
      setMe(null);
      setStatus("guest");
      if (err instanceof VendorApiError && err.status === 403) {
        setError(err.message);
        setDenyReason(err.reason ?? "none");
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

  const signOut = useCallback(async (): Promise<void> => {
    await getSupabaseBrowser()?.auth.signOut().catch(() => undefined);
    setMe(null);
    setStatus("guest");
    setError(null);
    setDenyReason(null);
  }, []);

  return { me, status, error, denyReason, refresh, signIn, signOut };
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

  /** ProductEditor-shaped save: POST for new rows, PATCH for edits. Throws
   * the API's message so the editor can show the real reason. */
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
      const message = vendorErrorMessage(err);
      setSaveError(message);
      throw new Error(message);
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

  /**
   * POST a brand-new row and hand back what the server created. `saveProduct`
   * answers "did it save"; the duplicate action needs the row's real id so it
   * can open the copy for editing (the server, not the client, mints ids).
   */
  const createProduct = useCallback(
    async (product: Product): Promise<Product> => {
      setSaveError(null);
      try {
        const data = await vendorSend<{ product: Product }>(
          "/api/vendor/products",
          "POST",
          product,
        );
        refresh();
        return data.product;
      } catch (err) {
        const message = vendorErrorMessage(err);
        setSaveError(message);
        throw new Error(message);
      }
    },
    [refresh],
  );

  return {
    ...res,
    products: res.data?.products ?? [],
    saveProduct,
    createProduct,
    saveError,
    patchProduct,
  };
};

export interface VendorProductCategoryRow {
  id: string;
  categoryId: string;
  name: string;
}

export const useVendorCategories = (enabled: boolean) => {
  const res = useVendorResource<{
    categories: Category[];
    vendorCategories: VendorProductCategoryRow[];
  }>("/api/vendor/categories", enabled);
  return {
    ...res,
    categories: res.data?.categories ?? [],
    vendorCategories: res.data?.vendorCategories ?? [],
    createCategory: async (categoryId: string, name: string) => {
      const result = await vendorSend<{ category: VendorProductCategoryRow }>(
        "/api/vendor/categories",
        "POST",
        { categoryId, name },
      );
      res.reload();
      return result.category;
    },
  };
};

export const useVendorEarnings = (enabled: boolean) => {
  const res = useVendorResource<{ earnings: VendorEarnings }>(
    "/api/vendor/earnings",
    enabled,
  );
  return { ...res, earnings: res.data?.earnings ?? null };
};

/* ------------------------------------------------------------------ */
/* B3 (2026-09-28) — the shop's own promo codes                        */
/* ------------------------------------------------------------------ */

/** The funnel window the dashboard shows (B4). */
export const VENDOR_FUNNEL_DAYS = 7 as const;

export interface VendorPromoRow {
  id: string;
  code: string;
  type: "percent" | "fixed" | "free_delivery";
  value: number;
  minOrder: number;
  maxDiscount?: number;
  description?: string;
  validFrom?: number;
  validUntil?: number;
  usageLimit?: number;
  used: number;
  active: boolean;
  createdAt?: number;
  createdBy?: string;
}

export interface PromoLimitsRow {
  maxPercent: number;
  maxDiscount: number;
  maxDays: number;
  maxUsage: number;
  maxActive: number;
}

export const useVendorPromos = (enabled: boolean) => {
  const res = useVendorResource<{
    promos: VendorPromoRow[];
    limits: PromoLimitsRow;
    usedTotal: number;
    discountBornePaisa: number;
  }>("/api/vendor/promos", enabled);
  const { reload } = res;
  const create = useCallback(
    async (draft: Record<string, unknown>): Promise<VendorPromoRow> => {
      const data = await vendorSend<{ promo: VendorPromoRow }>(
        "/api/vendor/promos",
        "POST",
        draft,
      );
      reload();
      return data.promo;
    },
    [reload],
  );
  const setActive = useCallback(
    async (id: string, active: boolean): Promise<VendorPromoRow> => {
      const data = await vendorSend<{ promo: VendorPromoRow }>(
        "/api/vendor/promos",
        "PATCH",
        { id, active },
      );
      reload();
      return data.promo;
    },
    [reload],
  );
  return {
    ...res,
    promos: res.data?.promos ?? [],
    limits: res.data?.limits ?? null,
    usedTotal: res.data?.usedTotal ?? 0,
    discountBornePaisa: res.data?.discountBornePaisa ?? 0,
    create,
    setActive,
  };
};

/* ------------------------------------------------------------------ */
/* B4 (2026-09-28) — the shop's own funnel                             */
/* ------------------------------------------------------------------ */

import type { ShopFunnel } from "@/lib/shop-funnel";
export type { ShopFunnel };

/**
 * The shop's own funnel (B4). Unlike the other resources this one keeps the
 * HTTP status, because 503 does NOT mean "empty shop" — it means migration
 * 202609280004 has not been run, and the card has to say exactly that.
 */
export const useVendorFunnel = (enabled: boolean, days: 7 | 28 = 7) => {
  const path = `/api/vendor/funnel?days=${days}`;
  const [funnel, setFunnel] = useState<ShopFunnel | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [status, setStatus] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    vendorGet<ShopFunnel>(path)
      .then((d) => {
        if (cancelled) return;
        setFunnel(d);
        setStatus(200);
        setError(null);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setFunnel(null);
        setStatus(err instanceof VendorApiError ? err.status : null);
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

  return { funnel, loading, error, status, missing: status === 503, refresh };
};

/* ------------------------------------------------------------------ */
/* B2 (2026-09-28) — reviews and the shop's reply                      */
/* ------------------------------------------------------------------ */

export interface VendorReviewRow {
  id: string;
  productId: string;
  productName: string;
  productSlug: string;
  rating: number;
  author: string;
  title?: string;
  body: string;
  date: number;
  verified: boolean;
  featured?: boolean;
  photos: string[];
  vendorReply?: string;
  vendorReplyAt?: number;
  vendorReplyBy?: string;
}

export const useVendorReviews = (enabled: boolean) => {
  const res = useVendorResource<{ reviews: VendorReviewRow[] }>(
    "/api/vendor/reviews",
    enabled,
  );
  const { reload } = res;
  const reply = useCallback(
    async (id: string, text: string): Promise<VendorReviewRow> => {
      const data = await vendorSend<{ review: VendorReviewRow }>(
        "/api/vendor/reviews",
        "PATCH",
        { id, reply: text },
      );
      // In-place re-read: the card keeps its rows while the answer saves.
      reload();
      return data.review;
    },
    [reload],
  );
  return { ...res, reviews: res.data?.reviews ?? [], reply };
};

/* ------------------------------------------------------------------ */
/* B1 (2026-09-28) — shop followers                                    */
/* ------------------------------------------------------------------ */

export interface ShopFollower {
  phone: string;
  marketingOk: boolean;
  lastNotifiedAt: string | null;
  createdAt: string;
}

export const useShopFollowers = (enabled: boolean) => {
  const res = useVendorResource<{
    followers: number;
    neverReached: string[];
    rows: ShopFollower[];
  }>("/api/vendor/followers", enabled);
  return {
    ...res,
    followers: res.data?.followers ?? 0,
    neverReached: res.data?.neverReached ?? [],
    rows: res.data?.rows ?? [],
  };
};

export const patchVendorShop = async (patch: Record<string, unknown>): Promise<Shop> => {
  const data = await vendorSend<{ shop: Shop }>("/api/vendor/shop", "PATCH", patch);
  return data.shop;
};
