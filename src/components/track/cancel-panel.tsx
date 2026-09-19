"use client";

/**
 * Customer cancel on the track page (UX audit 2026-09-18, P1 #14).
 *
 * The receipt has always said "ভুল হলে track page থেকে বাতিল করুন" — this is
 * that button. It only appears while the order can still be cancelled
 * online (pending / confirmed / preparing — the same gate the admin's Cancel
 * has); once the parcel is packed the panel turns into "call or WhatsApp
 * us", which is the honest answer at that point.
 *
 * Two taps, never one: the first opens a confirm row, the second cancels.
 */

import { useState } from "react";
import { useLanguage } from "@/components/i18n/language-provider";
import { canCustomerCancel, type Order } from "@/lib/orders";

export default function CancelPanel({
  order,
  phone,
  contactNumber,
  onCancelled,
}: {
  order: Order;
  /** The phone the shopper typed — it is the proof the API asks for. */
  phone: string;
  contactNumber: string | null;
  /** Called with the cancelled order so the timeline re-renders at once. */
  onCancelled: (next: Order) => void;
}) {
  const { t } = useLanguage();
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "late" | "error"; text: string } | null>(
    null,
  );

  // Already cancelled before we got here → the timeline banner says so; but
  // when THIS panel just did it, keep the confirmation on screen.
  const justCancelled = order.status === "cancelled" && message?.tone === "ok";
  if ((order.status === "cancelled" && !justCancelled) || order.status === "delivered" || order.isReturn) {
    return null;
  }

  const cancellable = !justCancelled && canCustomerCancel(order.status);
  const waHref = contactNumber
    ? `https://wa.me/88${contactNumber}?text=${encodeURIComponent(
        `PROSANTI order ${order.id} — I need to cancel / change this order.`,
      )}`
    : null;

  const cancel = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/track/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: order.id, phone, reason: reason.trim() || undefined }),
      });
      const data = (await res.json().catch(() => null)) as {
        ok?: boolean;
        code?: string;
        paymentRejected?: boolean;
      } | null;
      if (res.ok && data?.ok) {
        setMessage({ tone: "ok", text: t("track.cancelDone") });
        setConfirming(false);
        onCancelled({
          ...order,
          status: "cancelled",
          paymentStatus: data.paymentRejected ? "rejected" : order.paymentStatus,
          timeline: [...order.timeline, { status: "cancelled", at: Date.now() }],
        });
      } else if (res.status === 409 || data?.code === "too_late") {
        setMessage({ tone: "late", text: t("track.cancelTooLate") });
        setConfirming(false);
      } else {
        setMessage({ tone: "error", text: t("track.cancelFailed") });
      }
    } catch {
      setMessage({ tone: "error", text: t("track.cancelFailed") });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      className="rounded-3xl bg-paper p-6 ring-1 ring-line"
      aria-labelledby="cancel-panel-title"
      data-testid="cancel-panel"
    >
      <h3
        id="cancel-panel-title"
        className="text-[0.7rem] font-semibold uppercase tracking-[0.24em] text-ink-soft"
      >
        {t("track.cancelTitle")}
      </h3>
      {justCancelled ? null : (
        <p className="mt-2 text-sm leading-6 text-ink-soft">
          {cancellable ? t("track.cancelBody") : t("track.cancelTooLate")}
        </p>
      )}

      {message ? (
        <p
          role="status"
          data-testid="cancel-message"
          className={`mt-3 rounded-xl px-3 py-2 text-xs leading-5 ring-1 ${
            message.tone === "ok"
              ? "bg-forest-50 text-forest-900 ring-forest-200"
              : message.tone === "late"
                ? "bg-amber-50 text-amber-900 ring-amber-200"
                : "bg-rose-50 text-rose-800 ring-rose-200"
          }`}
        >
          {message.text}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {cancellable && !confirming ? (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="inline-flex min-h-11 items-center rounded-full bg-paper px-4 text-sm font-semibold text-rose-700 ring-1 ring-rose-200 hover:bg-rose-50"
          >
            {t("track.cancelButton")}
          </button>
        ) : null}
        {waHref && !justCancelled ? (
          <a
            href={waHref}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-11 items-center rounded-full bg-[#25D366] px-4 text-sm font-semibold text-white"
          >
            WhatsApp {contactNumber}
          </a>
        ) : null}
      </div>

      {cancellable && confirming ? (
        <div
          className="mt-4 rounded-2xl bg-rose-50 p-4 ring-1 ring-rose-200"
          data-testid="cancel-confirm"
        >
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-rose-900">
              {t("track.cancelReason")}
            </span>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={200}
              className="h-11 w-full rounded-xl bg-paper px-3 text-sm text-ink ring-1 ring-line focus:ring-2 focus:ring-rose-400"
            />
          </label>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void cancel()}
              disabled={busy}
              className="inline-flex min-h-11 items-center rounded-full bg-rose-700 px-5 text-sm font-semibold text-white hover:bg-rose-800 disabled:opacity-60"
            >
              {busy ? t("track.cancelling") : t("track.cancelConfirm")}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={busy}
              className="inline-flex min-h-11 items-center rounded-full bg-paper px-5 text-sm font-semibold text-ink ring-1 ring-line disabled:opacity-60"
            >
              {t("track.cancelKeep")}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
