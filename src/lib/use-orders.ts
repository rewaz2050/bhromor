"use client";

/**
 * Admin order data — live only. Staff sessions read/write through
 * /api/admin/orders (database §34 machine).
 *
 * The list is keyset-paginated (audit M5, 2026-09-16): the hook holds the
 * newest `PAGE` orders, `loadMore()` appends the next older page, and the
 * 10s poll re-walks however many pages are open so statuses stay fresh.
 * `useOrder(orderNo)` falls back to the detail endpoint for orders that are
 * older than the loaded pages instead of reporting "Order not found".
 */

import { useCallback, useEffect, useState } from "react";
import type { Order, OrderStatus } from "./orders";
import { useStaffLive } from "./use-staff-live";
import { AdminApiError, apiErrorMessage, apiGet, apiSend } from "./admin-api";

/** Rows per page — one call covers a typical shop's whole recent history. */
export const ORDERS_PAGE_SIZE = 200;

interface OrdersPageResponse {
  orders: Order[];
  nextCursor?: string | null;
}

export interface UseOrdersOptions {
  /** Server-side search (order no / customer name / phone). */
  q?: string;
}

const pageUrl = (q: string, cursor: string | null): string => {
  const params = new URLSearchParams({ limit: String(ORDERS_PAGE_SIZE) });
  if (q) params.set("q", q);
  if (cursor) params.set("cursor", cursor);
  return `/api/admin/orders?${params.toString()}`;
};

/** Newest-first walk over `pages` pages (stops early when exhausted). */
const fetchPages = async (
  q: string,
  pages: number,
): Promise<{ orders: Order[]; nextCursor: string | null }> => {
  const out: Order[] = [];
  let cursor: string | null = null;
  for (let i = 0; i < pages; i += 1) {
    const data: OrdersPageResponse = await apiGet<OrdersPageResponse>(
      pageUrl(q, cursor),
    );
    out.push(...data.orders);
    cursor = data.nextCursor ?? null;
    if (!cursor) break;
  }
  return { orders: out, nextCursor: cursor };
};

const mergeById = (prev: Order[], next: Order[]): Order[] => {
  const seen = new Set(prev.map((o) => o.id));
  return [...prev, ...next.filter((o) => !seen.has(o.id))];
};

export function useOrders(options: UseOrdersOptions = {}) {
  const q = (options.q ?? "").trim();
  const { live, checked } = useStaffLive();
  const [liveOrders, setLiveOrders] = useState<Order[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** How many pages the user has opened, remembered per query so a new
   *  search starts from page one again (derived, not reset in an effect). */
  const [opened, setOpened] = useState({ q, pages: 1 });
  const pages = opened.q === q ? opened.pages : 1;

  const refresh = useCallback(async (): Promise<boolean> => {
    try {
      const page = await fetchPages(q, pages);
      setLiveOrders(page.orders);
      setNextCursor(page.nextCursor);
      setError(null);
      return true;
    } catch (err) {
      setError(apiErrorMessage(err));
      return false;
    }
  }, [pages, q]);

  const loadMore = useCallback(async (): Promise<boolean> => {
    if (!live || !nextCursor || loadingMore) return false;
    setLoadingMore(true);
    try {
      const data = await apiGet<OrdersPageResponse>(pageUrl(q, nextCursor));
      setOpened({ q, pages: pages + 1 });
      setLiveOrders((prev) => mergeById(prev ?? [], data.orders));
      setNextCursor(data.nextCursor ?? null);
      setError(null);
      return true;
    } catch (err) {
      setError(apiErrorMessage(err));
      return false;
    } finally {
      setLoadingMore(false);
    }
  }, [live, loadingMore, nextCursor, pages, q]);

  useEffect(() => {
    if (!live) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial probe
    void refresh();
    // Free real-time polling every 10s — admin sees new orders instantly without cost
    const id = window.setInterval(() => {
      void refresh();
    }, 10000);
    return () => window.clearInterval(id);
  }, [live, refresh]);

  const advance = useCallback(
    async (
      id: string,
      to: OrderStatus,
      note?: string,
    ): Promise<boolean> => {
      if (!live) return false;
      try {
        await apiSend<{ order: Order }>(
          `/api/admin/orders/${encodeURIComponent(id)}/advance`,
          "POST",
          { to, note },
        );
        setError(null);
        await refresh();
        return true;
      } catch (err) {
        setError(apiErrorMessage(err));
        return false;
      }
    },
    [live, refresh],
  );

  const cancel = useCallback(
    (id: string): Promise<boolean> => advance(id, "cancelled"),
    [advance],
  );

  return {
    orders: live ? (liveOrders ?? []) : [],
    advance,
    cancel,
    reset: refresh,
    /** Live/staff mode, stored API error, and first-load state. */
    live,
    loading: live && (!checked || liveOrders === null),
    error,
    clearError: () => setError(null),
    refresh,
    /** Pagination: older orders exist beyond what is loaded. */
    hasMore: live && nextCursor !== null,
    loadMore,
    loadingMore,
  };
}

/**
 * One order for the staff detail page. Served from the loaded list when
 * present; otherwise fetched from /api/admin/orders/[orderNo] so orders
 * older than the loaded pages still open.
 */
export function useOrder(orderNo: string) {
  const base = useOrders();
  const { live, loading: listLoading, orders, refresh: refreshList } = base;
  const fromList = orders.find((o) => o.id === orderNo);
  const [fetched, setFetched] = useState<Order | null>(null);
  const [missing, setMissing] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const fetchDetail = useCallback(async (): Promise<void> => {
    if (!live || !orderNo) return;
    try {
      const data = await apiGet<{ order: Order }>(
        `/api/admin/orders/${encodeURIComponent(orderNo)}`,
      );
      setFetched(data.order);
      setMissing(false);
      setDetailError(null);
    } catch (err) {
      if (err instanceof AdminApiError && err.status === 404) {
        setFetched(null);
        setMissing(true);
        setDetailError(null);
      } else {
        setDetailError(apiErrorMessage(err));
      }
    }
  }, [live, orderNo]);

  useEffect(() => {
    if (!live || listLoading || fromList) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- detail fallback fetch (same pattern as the list probe)
    void fetchDetail();
  }, [fetchDetail, fromList, live, listLoading]);

  const refresh = useCallback(async (): Promise<boolean> => {
    const ok = await refreshList();
    if (!fromList) await fetchDetail();
    return ok;
  }, [fetchDetail, fromList, refreshList]);

  const advance = useCallback(
    async (id: string, to: OrderStatus, note?: string): Promise<boolean> => {
      const ok = await base.advance(id, to, note);
      if (!fromList) await fetchDetail();
      return ok;
    },
    [base, fetchDetail, fromList],
  );

  const cancel = useCallback(
    (id: string): Promise<boolean> => advance(id, "cancelled"),
    [advance],
  );

  const order = fromList ?? (fetched?.id === orderNo ? fetched : undefined);
  return {
    ...base,
    order,
    advance,
    cancel,
    refresh,
    error: base.error ?? detailError,
    /** List still loading, or the fallback fetch has not answered yet. */
    loading:
      listLoading || (live && !fromList && !order && !missing && !detailError),
  };
}
