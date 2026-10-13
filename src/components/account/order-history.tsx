"use client";

/**
 * Order history on the account dashboard (UX audit 2026-09-18, P1 #15).
 *
 * The account used to show stamps and a wishlist link and nothing about the
 * orders that earned the stamps. This lists the orders on the account phone,
 * each with the shop that sold it, the public milestone it sits in and one tap
 * to the tracker (which carries cancel / return / warranty).
 *
 * Two things the 2026-10-11 pass added, both because a dashboard that goes
 * stale is worse than none:
 *
 * - The orders that are still moving are pulled out into a strip at the top
 *   and re-read every 30 s while any of them is live. Before this, the
 *   dashboard said "Confirmed" until the shopper reloaded it by hand.
 * - "Load more" instead of a hard stop at 20 — the API clamps at 50 so a long
 *   history still opens fast.
 */

import ReorderButton from "@/components/orders/reorder-button";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useLanguage } from "@/components/i18n/language-provider";
import { deliverySlotSummary } from "@/lib/delivery-slots";
import { fetchWithDeadline } from "@/lib/fetch-with-deadline";
import { formatBdt } from "@/lib/format";
import { trackHref } from "@/lib/last-order";
import { useLiveRefresh } from "@/lib/use-live-refresh";
import { PUBLIC_STEPS, publicPhase, type OrderStatus } from "@/lib/orders";
import type { TranslationKey } from "@/lib/translations";

export interface HistoryRow {
  id: string;
  createdAt: number;
  status: OrderStatus;
  total: number;
  itemCount: number;
  firstItem: string | null;
  payment: "cod" | "bkash" | "nagad";
  paymentStatus: "pending_verification" | "verified" | "rejected" | null;
  scheduledAt: number | null;
  deliveryWindow: string | null;
  isPickup: boolean;
  isReturn: boolean;
  /** Optional (older API shapes omit it) — which shop this came from. */
  shopId?: string | null;
  shopName?: string | null;
  /** Optional (older API shapes omit it) — powers "Order again". */
  lines?: { productId: string; variantLabel: string; qty: number; name: string }[];
}

/** First page, and how far "Load more" steps each time. */
const PAGE_STEP = 20;
/** What the API will hand back at most (listOrdersForPhone clamps). */
const MAX_ROWS = 50;
/** While something is moving, keep the list honest. */
const ACTIVE_REFRESH_MS = 30_000;

const STEP_LABEL: Record<(typeof PUBLIC_STEPS)[number]["key"], TranslationKey> = {
  placed: "track.stepPlaced",
  confirmed: "track.stepConfirmed",
  "picked-up": "track.stepPickedUp",
  delivered: "track.stepDelivered",
};

// The rule moved to `lib/order-activity` so the home page can ask the same
// question without pulling this whole component into its bundle; re-exported
// here so every existing caller keeps working.
export { isOrderActive } from "@/lib/order-activity";
import { isOrderActive } from "@/lib/order-activity";

const when = (ms: number, lang: "en" | "bn"): string =>
  new Date(ms).toLocaleString(lang === "bn" ? "bn-BD" : "en-GB", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Dhaka",
  });

export default function OrderHistory({ phone }: { phone: string }) {
  const { t, lang } = useLanguage();
  const [state, setState] = useState<
    { kind: "loading" } | { kind: "ready"; rows: HistoryRow[] } | { kind: "error" }
  >({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [limit, setLimit] = useState(PAGE_STEP);
  const [moreBusy, setMoreBusy] = useState(false);

  /**
   * One loader for the first paint, the retry arrow and the background
   * refresh. `silent` keeps a re-read from replacing the list with a spinner
   * someone is in the middle of reading, and from turning one dropped request
   * into an error panel.
   */
  const load = useCallback(
    (silent: boolean) =>
      fetchWithDeadline(`/api/account/orders?limit=${limit}`, {
        cache: "no-store",
        credentials: "same-origin",
      })
        .then(async (res) => {
          if (!res.ok) throw new Error(String(res.status));
          const data = (await res.json()) as { orders?: HistoryRow[] };
          setState({ kind: "ready", rows: data.orders ?? [] });
        })
        .catch(() => {
          if (!silent) setState({ kind: "error" });
        })
        // Any settle clears "Load more" — the next page's load is not a
        // silent one, so gating this on `silent` left the button stuck.
        .finally(() => {
          setMoreBusy(false);
        }),
    [limit],
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- (re)load on demand
    setState({ kind: "loading" });
    void load(false);
  }, [load, attempt]);

  // The strip only earns its keep while something is actually moving, so the
  // poll stops by itself once the last parcel has landed.
  const hasActive = state.kind === "ready" && state.rows.some((r) => isOrderActive(r.status));
  const refreshSilently = useCallback(() => {
    void load(true);
  }, [load]);
  useLiveRefresh(hasActive, ACTIVE_REFRESH_MS, refreshSilently);

  const rows = state.kind === "ready" ? state.rows : [];
  const active = rows.filter((r) => isOrderActive(r.status));
  const stepLabel = (row: HistoryRow): string => {
    if (row.status === "cancelled") return lang === "bn" ? "বাতিল" : "Cancelled";
    const phase = publicPhase(row.status);
    const step = phase >= 0 ? PUBLIC_STEPS[phase] : null;
    return step ? t(STEP_LABEL[step.key]) : row.status;
  };
  const trackLink = (row: HistoryRow) => (
    <Link
      href={trackHref(row.id, phone)}
      className="inline-flex min-h-9 items-center rounded-full bg-forest-800 px-3.5 text-xs font-semibold text-ivory-50 hover:bg-forest-700"
    >
      {t("track.historyTrack")} →
    </Link>
  );

  return (
    <section
      className="border border-line bg-paper p-6 sm:p-8"
      aria-labelledby="order-history-title"
      data-testid="order-history"
    >
      <h2 id="order-history-title" className="font-display text-2xl text-forest-900">
        {t("track.historyTitle")}
      </h2>

      {state.kind === "loading" ? (
        <p className="mt-4 text-sm text-ink-soft" role="status">
          {t("track.historyLoading")}
        </p>
      ) : state.kind === "error" ? (
        <p className="mt-4 text-sm text-rose-800" role="alert">
          {t("track.historyFailed")}{" "}
          <button
            type="button"
            onClick={() => setAttempt((n) => n + 1)}
            className="ml-1 underline underline-offset-2"
          >
            ↻
          </button>
        </p>
      ) : state.rows.length === 0 ? (
        <div className="mt-4">
          <p className="text-sm text-ink-soft">{t("track.historyEmpty")}</p>
          <Link href="/shop" className="editorial-button mt-4 bg-forest-800 text-white">
            {t("nav.shop")} →
          </Link>
        </div>
      ) : (
        <>
          {active.length > 0 ? (
            <div
              className="mt-5 rounded-2xl bg-forest-50 p-4 ring-1 ring-forest-200"
              data-testid="active-orders"
            >
              <p className="font-display text-lg font-medium text-forest-900">
                {t("track.activeTitle")}
              </p>
              <ul className="mt-3 space-y-3">
                {active.map((row) => (
                  <li key={`live-${row.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-2">
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-sm font-bold text-forest-900">{row.id}</span>
                        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wider text-amber-900 ring-1 ring-amber-200">
                          {stepLabel(row)}
                        </span>
                      </p>
                      <p className="mt-1 truncate text-sm text-ink">
                        {row.shopName ? `${row.shopName} · ` : ""}
                        {row.firstItem ?? "—"}
                      </p>
                    </div>
                    {trackLink(row)}
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-[11px] text-ink-soft">{t("track.activeNote")}</p>
            </div>
          ) : null}

          <ul className="mt-4 divide-y divide-line">
            {rows.map((row) => {
              const cancelled = row.status === "cancelled";
              const slot = deliverySlotSummary(
                {
                  deliveryWindow: row.deliveryWindow,
                  scheduledAt: row.scheduledAt,
                  isPickup: row.isPickup,
                },
                lang,
              );
              return (
                <li key={row.id} className="flex flex-wrap items-start gap-x-4 gap-y-2 py-4">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-bold text-forest-900">{row.id}</span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wider ring-1 ${
                          cancelled
                            ? "bg-rose-50 text-rose-800 ring-rose-200"
                            : row.status === "delivered"
                              ? "bg-forest-50 text-forest-800 ring-forest-200"
                              : "bg-amber-50 text-amber-900 ring-amber-200"
                        }`}
                      >
                        {stepLabel(row)}
                      </span>
                      {row.isReturn ? (
                        <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wider text-sky-900 ring-1 ring-sky-200">
                          Return
                        </span>
                      ) : null}
                      {row.payment !== "cod" && row.paymentStatus === "pending_verification" && !cancelled ? (
                        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wider text-amber-900 ring-1 ring-amber-200">
                          {row.payment === "bkash" ? "bKash" : "Nagad"} · verifying
                        </span>
                      ) : null}
                    </p>
                    {row.shopName ? (
                      <p className="mt-1 truncate text-xs font-semibold text-forest-800">
                        {row.shopName}
                      </p>
                    ) : null}
                    <p className="mt-1 truncate text-sm text-ink">
                      {row.firstItem ?? "—"}
                      {row.itemCount > 1 ? (
                        <span className="text-ink-soft">
                          {" "}
                          · {lang === "bn" ? `মোট ${row.itemCount}টি` : `${row.itemCount} items`}
                        </span>
                      ) : null}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-soft">
                      {when(row.createdAt, lang)}
                      {slot ? ` · ${slot}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <span className="text-sm font-semibold text-ink">{formatBdt(row.total)}</span>
                    <div className="flex flex-wrap items-center justify-end gap-1.5">
                      {!row.isReturn && (row.lines?.length ?? 0) > 0 ? (
                        <ReorderButton lines={row.lines ?? []} compact />
                      ) : null}
                      {trackLink(row)}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>

          {rows.length >= limit && limit < MAX_ROWS ? (
            <button
              type="button"
              disabled={moreBusy}
              onClick={() => {
                setMoreBusy(true);
                setLimit((n) => Math.min(n + PAGE_STEP, MAX_ROWS));
              }}
              className="mt-5 min-h-11 rounded-full px-5 text-sm font-semibold text-forest-800 ring-1 ring-line transition-colors hover:ring-line-strong disabled:opacity-50"
            >
              {moreBusy ? t("track.loadingMore") : t("track.loadMore")}
            </button>
          ) : null}
        </>
      )}
    </section>
  );
}
