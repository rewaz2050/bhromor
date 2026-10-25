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

import { useCallback, useEffect, useRef, useState } from "react";
import type { Order, OrderStatus } from "./orders";
import { useStaffLive } from "./use-staff-live";
import { usePoll } from "./use-poll";
import { AdminApiError, apiErrorMessage, apiGet, apiSend } from "./admin-api";

/** Rows per page — one call covers a typical shop's whole recent history. */
export const ORDERS_PAGE_SIZE = 200;

/** Background refresh cadence while the tab is visible (paused when hidden). */
export const ORDERS_POLL_MS = 10_000;

interface OrdersPageResponse {
  orders: Order[];
  nextCursor?: string | null;
}

export interface UseOrdersOptions {
  /** Server-side search (order no / customer name / phone). */
  q?: string;
  /** Only this shop's orders — the Admin → Shops deep link (2026-09-27). */
  shop?: string;
}

const pageUrl = (q: string, cursor: string | null, shop = ""): string => {
  const params = new URLSearchParams({ limit: String(ORDERS_PAGE_SIZE) });
  if (q) params.set("q", q);
  if (shop) params.set("shop", shop);
  if (cursor) params.set("cursor", cursor);
  return `/api/admin/orders?${params.toString()}`;
};

/** Newest-first walk over `pages` pages (stops early when exhausted). */
const fetchPages = async (
  q: string,
  pages: number,
  shop = "",
): Promise<{ orders: Order[]; nextCursor: string | null }> => {
  const out: Order[] = [];
  let cursor: string | null = null;
  for (let i = 0; i < pages; i += 1) {
    const data: OrdersPageResponse = await apiGet<OrdersPageResponse>(
      pageUrl(q, cursor, shop),
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
  const shop = (options.shop ?? "").trim();
  const queryKey = JSON.stringify([q, shop]);
  const { live, checked } = useStaffLive();
  const [liveOrders, setLiveOrders] = useState<Order[] | null>(null);
  const [dataKey, setDataKey] = useState(queryKey);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [settled, setSettled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Read ownership is synchronous, unlike React's batched loading state.
  // Opened-page count belongs to this session/query, not a saved callback.
  const lifecycle = useRef({ live: false, key: queryKey, epoch: 0, request: 0, pages: 1, cursor: null as string | null, paging: false });
  useEffect(() => {
    const state = lifecycle.current;
    state.live = live;
    state.key = queryKey;
    state.epoch++;
    state.request++;
    state.pages = 1;
    state.cursor = null;
    state.paging = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- discard the previous session/query snapshot
    setLiveOrders(null);
    setDataKey(queryKey);
    setNextCursor(null);
    setLoadingMore(false);
    setSettled(false);
    setError(null);
    return () => { state.live = false; state.epoch++; state.request++; };
  }, [live, queryKey]);

  const refresh = useCallback(async (): Promise<boolean> => {
    const state = lifecycle.current;
    if (!state.live || state.key !== queryKey) return false;
    const request = ++state.request;
    const current = () => state.live && state.key === queryKey && state.request === request;
    // Explicit refresh supersedes an older pagination request, including its spinner.
    state.paging = false;
    setLoadingMore(false);
    try {
      const page = await fetchPages(q, state.pages, shop);
      if (!current()) return false;
      state.cursor = page.nextCursor;
      setLiveOrders(page.orders);
      setNextCursor(page.nextCursor);
      setError(null);
      return true;
    } catch (err) {
      if (!current()) return false;
      setError(apiErrorMessage(err));
      return false;
    } finally {
      if (current()) setSettled(true);
    }
  }, [q, shop, queryKey]);

  const loadMore = useCallback(async (): Promise<boolean> => {
    const state = lifecycle.current;
    if (!state.live || state.key !== queryKey || !state.cursor || state.paging) return false;
    const cursor = state.cursor;
    const request = ++state.request;
    const current = () => state.live && state.key === queryKey && state.request === request;
    state.paging = true;
    setLoadingMore(true);
    try {
      const data = await apiGet<OrdersPageResponse>(pageUrl(q, cursor, shop));
      if (!current()) return false;
      state.pages++;
      state.cursor = data.nextCursor ?? null;
      setLiveOrders(prev => mergeById(prev ?? [], data.orders));
      setNextCursor(data.nextCursor ?? null);
      setError(null);
      return true;
    } catch (err) {
      if (!current()) return false;
      setError(apiErrorMessage(err));
      return false;
    } finally {
      if (current()) { state.paging = false; setLoadingMore(false); }
    }
  }, [q, shop, queryKey]);

  useEffect(() => {
    if (live) void refresh();
  }, [live, refresh]);
  // A background tick must not starve a slow older-page request. Manual refresh
  // still supersedes it; completed pages are re-walked on subsequent polls.
  const pollRefresh = useCallback(() => lifecycle.current.paging ? Promise.resolve(false) : refresh(), [refresh]);
  usePoll(pollRefresh, ORDERS_POLL_MS, live);

  const advance = useCallback(
    async (id: string, to: OrderStatus, note?: string): Promise<boolean> => {
      const state = lifecycle.current;
      if (!live || !state.live || state.key !== queryKey) return false;
      const epoch = state.epoch;
      const current = () => state.live && state.key === queryKey && state.epoch === epoch;
      try {
        await apiSend<{ order: Order }>(`/api/admin/orders/${encodeURIComponent(id)}/advance`, "POST", { to, note });
        if (current()) { setError(null); await refresh(); }
        return true;
      } catch (err) {
        if (current()) setError(apiErrorMessage(err));
        return false;
      }
    },
    [live, refresh, queryKey],
  );
  const cancel = useCallback((id: string): Promise<boolean> => advance(id, "cancelled"), [advance]);
  const current = live && dataKey === queryKey;
  return {
    orders: current ? (liveOrders ?? []) : [],
    advance,
    cancel,
    reset: refresh,
    live,
    loading: live && (!checked || !current || !settled),
    error: current ? error : null,
    clearError: () => setError(null),
    refresh,
    hasMore: current && nextCursor !== null,
    loadMore,
    loadingMore: current && loadingMore,
  };
}

/**
 * One order for the staff detail page. Served from the loaded list when
 * present; otherwise fetched from /api/admin/orders/[orderNo] so orders
 * older than the loaded pages still open.
 */
export function useOrder(orderNo: string) {
  const base = useOrders();
  const { live, loading: listLoading, orders, refresh: refreshList, advance: advanceList } = base;
  const fromList = orders.find(o => o.id === orderNo);
  const [fetched, setFetched] = useState<Order | null>(null);
  const [detailKey, setDetailKey] = useState(orderNo);
  const [missing, setMissing] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const lifecycle = useRef({ live: false, orderNo, request: 0 });
  useEffect(() => {
    const state = lifecycle.current;
    state.live = live;
    state.orderNo = orderNo;
    state.request++;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- detail cache/errors belong to one session/order
    setFetched(null);
    setDetailKey(orderNo);
    setMissing(false);
    setDetailError(null);
    return () => { state.live = false; state.request++; };
  }, [live, orderNo]);

  const fetchDetail = useCallback(async (): Promise<void> => {
    const state = lifecycle.current;
    if (!state.live || state.orderNo !== orderNo || !orderNo) return;
    const request = ++state.request;
    const current = () => state.live && state.orderNo === orderNo && state.request === request;
    setMissing(false);
    setDetailError(null);
    try {
      const data = await apiGet<{ order: Order }>(`/api/admin/orders/${encodeURIComponent(orderNo)}`);
      if (!current()) return;
      setFetched(data.order);
      setMissing(false);
      setDetailError(null);
    } catch (err) {
      if (!current()) return;
      if (err instanceof AdminApiError && err.status === 404) {
        setFetched(null);
        setMissing(true);
        setDetailError(null);
      } else {
        setDetailError(apiErrorMessage(err));
      }
    }
  }, [orderNo]);

  useEffect(() => {
    if (!live || listLoading || fromList) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- start the scoped API read and clear its previous retry error
    void fetchDetail();
  }, [fetchDetail, fromList, live, listLoading]);

  const refresh = useCallback(async (): Promise<boolean> => {
    const ok = await refreshList();
    if (!fromList) await fetchDetail();
    return ok;
  }, [fetchDetail, fromList, refreshList]);
  const advance = useCallback(async (id: string, to: OrderStatus, note?: string): Promise<boolean> => {
    const ok = await advanceList(id, to, note);
    if (!fromList) await fetchDetail();
    return ok;
  }, [advanceList, fetchDetail, fromList]);
  const cancel = useCallback((id: string): Promise<boolean> => advance(id, "cancelled"), [advance]);
  const current = live && detailKey === orderNo;
  const order = live ? (fromList ?? (current && fetched?.id === orderNo ? fetched : undefined)) : undefined;
  return {
    ...base,
    order,
    advance,
    cancel,
    refresh,
    error: base.error ?? (current ? detailError : null),
    loading: listLoading || (live && !fromList && !order && !(current && missing) && !(current && detailError)),
  };
}
