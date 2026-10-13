"use client";

/**
 * "Where is my order?" — answered before the shopper asks (2026-10-13).
 *
 * The home page had no idea whether this visitor had a parcel on the way.
 * Its whole tree read the catalog and the CMS settings and nothing else, so
 * a returning customer whose order was out for delivery got the shop shelf
 * and had to hunt for the /track link down in the trust strip. The abandoned
 * bag was remembered (`bag-waiting-banner`); the actual orders were not.
 *
 * Now a signed-in visitor gets one read of their recent orders:
 *   · anything still moving → a card with the shop, the step it is on, the
 *     total, and one tap into the tracker;
 *   · nothing moving → the last order with "Order again", the same button
 *     the account history uses, sitting where a returning shopper lands
 *     rather than three screens deep.
 *
 * Guests get nothing and cost nothing: without a session the fetch never
 * happens. The card re-reads on the same tick the account history uses, and
 * only while a parcel is genuinely still moving.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

import ReorderButton from "@/components/orders/reorder-button";
import { useLanguage } from "@/components/i18n/language-provider";
import { IconArrowRight, IconBox } from "@/components/ui/icons";
import { bnDigits } from "@/lib/arrival";
import { fetchWithDeadline } from "@/lib/fetch-with-deadline";
import { formatBdt } from "@/lib/format";
import { trackHref } from "@/lib/last-order";
import { PUBLIC_STEPS, publicPhase } from "@/lib/orders";
import { isOrderActive } from "@/lib/order-activity";
import { useCustomer } from "@/lib/use-customer";
import { useLiveRefresh } from "@/lib/use-live-refresh";
import type { HistoryRow } from "@/components/account/order-history";
import type { TranslationKey } from "@/lib/translations";

/** Same cadence as the account history — one shared rhythm for order state. */
const HOME_ORDERS_REFRESH_MS = 30_000;

/** Enough to recognise a parcel and re-add it; the tracker has the detail. */
const HOME_ORDER_ROWS = 6;

const STEP_LABEL: Record<(typeof PUBLIC_STEPS)[number]["key"], TranslationKey> = {
  placed: "track.stepPlaced",
  confirmed: "track.stepConfirmed",
  "picked-up": "track.stepPickedUp",
  delivered: "track.stepDelivered",
};

/** The public milestone this row is on, in the shopper's language. */
const stepLabel = (row: HistoryRow, t: (k: TranslationKey) => string): string => {
  const index = publicPhase(row.status);
  const key = index >= 0 ? PUBLIC_STEPS[index]?.key : undefined;
  return key ? t(STEP_LABEL[key]) : row.status;
};

export default function HomeOrders() {
  const { t, lang } = useLanguage();
  const { customer } = useCustomer();
  // Kept together with the phone the rows belong to. A response that lands
  // after the shopper signed out — or while someone else is signing in —
  // must never paint another customer's parcels, and comparing the phone
  // does that without clearing state from inside an effect.
  const [state, setState] = useState<{ phone: string; rows: HistoryRow[] } | null>(null);

  // `silent` keeps the card on screen through a refresh: a shopper watching
  // their parcel move should never see it blink out and back.
  const load = useCallback(
    (silent: boolean) => {
      if (!customer) return Promise.resolve();
      const phone = customer.phone;
      return fetchWithDeadline(`/api/account/orders?limit=${HOME_ORDER_ROWS}`, { cache: "no-store" })
        .then(async (res) => {
          if (!res.ok) throw new Error(String(res.status));
          const data = (await res.json()) as { orders?: HistoryRow[] };
          setState({ phone, rows: data.orders ?? [] });
        })
        .catch(() => {
          // A failed background read is not news: keep what is on screen.
          if (!silent) setState({ phone, rows: [] });
        });
    },
    [customer],
  );

  useEffect(() => {
    // A guest has no orders and must not be shown an empty card, so the read
    // is keyed to the session appearing — signing in here fills the home
    // page without a reload.
    if (!customer) return;
    void load(false);
  }, [customer, load]);

  const rows = customer && state?.phone === customer.phone ? state.rows : null;
  const active = rows?.filter((r) => isOrderActive(r.status)) ?? [];
  // The poll stops by itself once the last parcel lands.
  const refreshSilently = useCallback(() => {
    void load(true);
  }, [load]);
  useLiveRefresh(active.length > 0, HOME_ORDERS_REFRESH_MS, refreshSilently);

  if (!customer || !rows || rows.length === 0) return null;

  const done = rows.filter((r) => !isOrderActive(r.status) && (r.lines?.length ?? 0) > 0);

  return (
    <section
      data-testid="home-orders"
      aria-label={t("home.ordersAria")}
      className="mx-auto w-full max-w-7xl space-y-2 px-4 pt-4 sm:px-6 lg:px-8"
    >
      {active.map((row) => (
        <article
          key={row.id}
          className="flex flex-wrap items-center gap-3 rounded-2xl bg-paper px-4 py-3 ring-1 ring-forest-200"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-forest-50 text-forest-800">
            <IconBox className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-forest-900">
              {row.shopName ?? row.firstItem ?? t("home.ordersAria")}
            </p>
            <p className="truncate text-xs text-ink-soft">
              {stepLabel(row, t)} · {formatBdt(row.total)} · {row.id}
            </p>
          </div>
          <Link
            href={trackHref(row.id, customer.phone)}
            data-testid="home-order-track"
            className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full bg-forest-800 px-4 text-xs font-semibold text-ivory-50 hover:bg-forest-700"
          >
            {t("home.ordersTrack")}
            <IconArrowRight className="h-3.5 w-3.5" />
          </Link>
        </article>
      ))}

      {/* Nothing moving — offer the last order again instead of silence. */}
      {active.length === 0 && done.length > 0 && (
        <article
          data-testid="home-order-again"
          className="flex flex-wrap items-center gap-3 rounded-2xl bg-paper px-4 py-3 ring-1 ring-line"
        >
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-forest-900">
              {t("home.ordersAgainTitle")}
            </p>
            <p className="truncate text-xs text-ink-soft">
              {done[0].shopName ?? done[0].firstItem ?? ""}
              {done[0].itemCount > 0
                ? ` · ${lang === "bn" ? bnDigits(String(done[0].itemCount)) : done[0].itemCount} ${t("home.ordersAgainPcs")}`
                : ""}
            </p>
          </div>
          <ReorderButton lines={done[0].lines ?? []} compact />
          <Link
            href="/account"
            className="inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-xs font-semibold text-ink-soft ring-1 ring-line hover:bg-cream hover:text-ink"
          >
            {t("home.ordersAll")}
            <IconArrowRight className="h-3.5 w-3.5" />
          </Link>
        </article>
      )}
    </section>
  );
}
