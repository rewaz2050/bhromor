"use client";

/**
 * Order history on the account dashboard (UX audit 2026-09-18, P1 #15).
 *
 * The account used to show stamps and a wishlist link and nothing about the
 * orders that earned the stamps. This lists the last 20 orders on the
 * account phone, each with the public milestone it sits in and one tap to
 * the tracker (which carries cancel / return / warranty).
 */

import ReorderButton from "@/components/orders/reorder-button";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useLanguage } from "@/components/i18n/language-provider";
import { deliverySlotSummary } from "@/lib/delivery-slots";
import { formatBdt } from "@/lib/format";
import { trackHref } from "@/lib/last-order";
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
  /** Optional (older API shapes omit it) — powers "Order again". */
  lines?: { productId: string; variantLabel: string; qty: number; name: string }[];
}

const STEP_LABEL: Record<(typeof PUBLIC_STEPS)[number]["key"], TranslationKey> = {
  placed: "track.stepPlaced",
  confirmed: "track.stepConfirmed",
  "picked-up": "track.stepPickedUp",
  delivered: "track.stepDelivered",
};

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

  useEffect(() => {
    let live = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- (re)load on demand
    setState({ kind: "loading" });
    fetch("/api/account/orders", { cache: "no-store", credentials: "same-origin" })
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as { orders?: HistoryRow[] };
        if (live) setState({ kind: "ready", rows: data.orders ?? [] });
      })
      .catch(() => {
        if (live) setState({ kind: "error" });
      });
    return () => {
      live = false;
    };
  }, [attempt]);

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
        <ul className="mt-4 divide-y divide-line">
          {state.rows.map((row) => {
            const phase = publicPhase(row.status);
            const step = phase >= 0 ? PUBLIC_STEPS[phase] : null;
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
                      {cancelled
                        ? lang === "bn"
                          ? "বাতিল"
                          : "Cancelled"
                        : step
                          ? t(STEP_LABEL[step.key])
                          : row.status}
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
                    {slot ? ` · 🕒 ${slot}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <span className="text-sm font-semibold text-ink">{formatBdt(row.total)}</span>
                  <div className="flex flex-wrap items-center justify-end gap-1.5">
                    {!row.isReturn && (row.lines?.length ?? 0) > 0 ? (
                      <ReorderButton lines={row.lines ?? []} compact />
                    ) : null}
                    <Link
                      href={trackHref(row.id, phone)}
                      className="inline-flex min-h-9 items-center rounded-full bg-forest-800 px-3.5 text-xs font-semibold text-ivory-50 hover:bg-forest-700"
                    >
                      {t("track.historyTrack")} →
                    </Link>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
