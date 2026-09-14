"use client";

/**
 * Return / exchange panel on the track page (P1 #13).
 *
 * Three honest states, all computed from the same data the timeline shows:
 *   • the tracked order IS a return pickup → say so, show its reverse-leg
 *     status;
 *   • a delivered parent has a live return → show that return's status and
 *     one tap to track the pickup leg;
 *   • a delivered parent with nothing yet → the request form, inside the
 *     real 7-day window from the proven delivery moment. The server
 *     re-checks everything (ps_return_eligible) — this UI never grants
 *     eligibility the database did not.
 */

import { useMemo, useState } from "react";
import type { Order } from "@/lib/orders";
import { IconBox, IconCheck, IconRefresh } from "@/components/ui/icons";

const EXCHANGE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

const RETURN_STATUS_COPY: Record<
  string,
  { label: string; note: string }
> = {
  requested: {
    label: "Awaiting the shop's approval",
    note: "The shop checks the request and tells you — tracking this order keeps updating.",
  },
  approved: {
    label: "Approved — pickup on the way",
    note: "A rider will be assigned to collect the item from your address.",
  },
  picked_up: {
    label: "Picked up by the rider",
    note: "The item is on its way back to the shop.",
  },
  refunded: {
    label: "Received by the shop",
    note: "The exchange or refund is handled by the shop from here — they will reach out on the number you ordered with.",
  },
  rejected: {
    label: "Not approved",
    note: "The shop could not take this one. If that seems wrong, call them on the number below with the order ID.",
  },
};

const REASONS = [
  { value: "size", label: "Wrong / uncomfortable size" },
  { value: "color", label: "Colour swap" },
  { value: "defective", label: "Defective or damaged item" },
  { value: "other", label: "Other reason" },
];

export default function ReturnPanel({
  order,
  onTrack,
}: {
  order: Order;
  /** Pre-fill the track form with a pickup-leg order number. */
  onTrack: (orderNo: string, phone: string) => void;
}) {
  const deliveredAt = useMemo(
    () => order.timeline.find((t) => t.status === "delivered")?.at,
    [order],
  );
  const windowEndsAt = deliveredAt ? deliveredAt + EXCHANGE_WINDOW_MS : null;
  // Both date computations live with the other hooks (before any early
  // return) so the hook order is stable across order lookups.
  // eslint-disable-next-line react-hooks/purity -- a 7-day window can only be evaluated against the wall clock at render
  const expired = windowEndsAt !== null && Date.now() > windowEndsAt;
  const windowDate = useMemo(
    () =>
      windowEndsAt === null
        ? ""
        : new Date(windowEndsAt).toLocaleDateString("en-GB", {
            day: "numeric",
            month: "long",
            year: "numeric",
          }),
    [windowEndsAt],
  );

  const [reason, setReason] = useState("size");
  const [details, setDetails] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<string | null>(null);

  // ---- The tracked order is itself a return pickup ------------------------
  if (order.isReturn) {
    const copy =
      RETURN_STATUS_COPY[order.returnStatus ?? "requested"] ??
      RETURN_STATUS_COPY.requested;
    return (
      <section
        aria-label="Return pickup details"
        className="rounded-3xl bg-sky-50 p-6 ring-1 ring-sky-200"
      >
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-sky-700 text-white">
            <IconRefresh className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-display text-lg font-semibold text-forest-900">
              Return / exchange pickup
            </p>
            <p className="mt-0.5 text-sm leading-6 text-ink-soft">
              A rider collects the item from your address and brings it back
              to the shop. Total: ৳0 — no payment for the pickup leg.
            </p>
          </div>
          <span className="rounded-full bg-sky-200 px-3 py-1 text-xs font-bold uppercase tracking-wide text-sky-900">
            {copy.label}
          </span>
        </div>
        {order.returnReason && (
          <p className="mt-3 text-xs leading-5 text-ink-soft">
            <strong className="text-ink">Reason:</strong> {order.returnReason}
          </p>
        )}
        <p className="mt-2 text-xs leading-5 text-ink-soft">{copy.note}</p>
      </section>
    );
  }

  // ---- Only delivered parents can start a return --------------------------
  if (order.status !== "delivered") return null;

  // ---- A live return already exists for this parent -----------------------
  const child = order.returnChild;
  if (child) {
    const copy = RETURN_STATUS_COPY[child.returnStatus] ?? RETURN_STATUS_COPY.requested;
    return (
      <section
        aria-label="Return status"
        className="rounded-3xl bg-paper p-6 ring-1 ring-line"
      >
        <h3 className="text-[0.7rem] font-semibold uppercase tracking-[0.24em] text-ink-soft">
          Your return / exchange
        </h3>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="font-display text-lg text-forest-900">{copy.label}</p>
            <p className="mt-1 max-w-md text-xs leading-5 text-ink-soft">
              {copy.note}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onTrack(child.orderNo, order.customer.phone)}
            className="inline-flex items-center gap-1.5 rounded-full bg-forest-800 px-4 py-2.5 text-xs font-semibold text-ivory-50 transition-colors hover:bg-forest-700"
          >
            <IconBox className="h-3.5 w-3.5" />
            Track pickup · {child.orderNo}
          </button>
        </div>
      </section>
    );
  }

  // ---- Nothing yet: inside or outside the window --------------------------
  if (created) {
    return (
      <section
        aria-label="Return request accepted"
        className="rounded-3xl border border-emerald-200 bg-emerald-50/70 p-6"
      >
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-700 text-white">
            <IconCheck className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-display text-lg font-semibold text-forest-900">
              Pickup request sent to the shop
            </p>
            <p className="mt-1 text-sm leading-6 text-ink-soft">
              Keep the pickup order number{" "}
              <strong className="font-mono text-ink">{created}</strong> —
              track it with the same phone number and you will see the
              rider&apos;s leg as it happens.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onTrack(created, order.customer.phone)}
            className="inline-flex items-center gap-1.5 rounded-full bg-forest-800 px-4 py-2.5 text-xs font-semibold text-ivory-50 transition-colors hover:bg-forest-700"
          >
            <IconBox className="h-3.5 w-3.5" />
            Track pickup
          </button>
        </div>
      </section>
    );
  }

  if (!windowEndsAt) {
    return (
      <section className="rounded-3xl bg-paper p-6 ring-1 ring-line">
        <p className="text-sm leading-6 text-ink-soft">
          We cannot confirm the delivery date of this order, so the exchange
          window is not shown. If something is wrong with your item, use the
          contact page with the order ID and the shop will check it.
        </p>
      </section>
    );
  }

  if (expired) {
    return (
      <section className="rounded-3xl bg-paper p-6 ring-1 ring-line">
        <p className="text-sm leading-6 text-ink-soft">
          The 7-day exchange window for this order ended on {windowDate}. If
          the item has a fault that was not visible on delivery, use the
          contact page with the order ID — the shop will look at it case by
          case.
        </p>
      </section>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (details.trim().length < 5) {
      setError("Tell the shop a little more — a sentence is enough.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/returns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: order.id,
          phone: order.customer.phone,
          reason,
          details: details.trim(),
        }),
      });
      const data = (await res.json().catch(() => null)) as {
        order?: { id?: string };
        error?: string;
      } | null;
      if (res.ok && data?.order?.id) {
        setCreated(data.order.id);
      } else {
        setError(
          data?.error ?? "The request could not be sent — try again.",
        );
      }
    } catch {
      setError("Could not reach the shop — check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="rounded-3xl bg-paper p-6 ring-1 ring-line">
      <h3 className="text-[0.7rem] font-semibold uppercase tracking-[0.24em] text-ink-soft">
        Return / exchange
      </h3>
      <p className="mt-2 text-sm leading-6 text-ink-soft">
        Wrong size or colour? A rider can pick the item up from your home and
        bring it back to the shop — free, until{" "}
        <strong className="text-ink">{windowDate}</strong> (7 days from
        delivery).
      </p>
      <form onSubmit={submit} className="mt-4 space-y-4">
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Return reason">
          {REASONS.map((r) => (
            <button
              key={r.value}
              type="button"
              role="radio"
              aria-checked={reason === r.value}
              onClick={() => setReason(r.value)}
              className={`min-h-11 rounded-full px-4 text-xs font-medium transition-colors ${
                reason === r.value
                  ? "bg-forest-800 font-semibold text-ivory-50"
                  : "bg-paper text-ink ring-1 ring-line hover:ring-forest-400"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
        <textarea
          value={details}
          onChange={(e) => {
            setDetails(e.target.value);
            if (error) setError(null);
          }}
          rows={3}
          maxLength={400}
          placeholder="e.g. The panjabi is a bit tight across the chest — size M instead of L."
          className="w-full resize-y rounded-2xl bg-ivory-50 px-4 py-3 text-sm text-ink ring-1 ring-line placeholder:text-ink-soft/50 focus:outline-none focus:ring-2 focus:ring-forest-500"
        />
        {error && (
          <p role="alert" className="text-xs font-medium text-rose-800">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex h-12 items-center justify-center rounded-full bg-forest-800 px-6 text-sm font-semibold text-ivory-50 transition-colors hover:bg-forest-700 disabled:opacity-60"
        >
          {submitting ? "Sending…" : "Request home pickup"}
        </button>
      </form>
    </section>
  );
}
