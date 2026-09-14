"use client";

/**
 * Warranty claim panel on the track page (P1 #14).
 *
 * Shown only for delivered orders that contain at least one warranted item
 * (the shop sets warranty_days on accessories; nothing is warranted by
 * default). The window runs warranty_days from the proven delivery moment —
 * the same moment the timeline shows. The customer reports a problem; the
 * shop reviews and approves/rejects with a note. The replacement or refund
 * itself is the shop's offline handling.
 *
 * All hooks run before the early returns: the TrackView re-renders this
 * component across order lookups, so hook order must stay stable.
 */

import { useEffect, useMemo, useState } from "react";
import type { Order, OrderItem } from "@/lib/orders";
import { IconCheck, IconClose, IconShield } from "@/components/ui/icons";

const DAY_MS = 24 * 60 * 60 * 1000;

interface ClaimInfo {
  id: string;
  productId: string;
  productName: string;
  problem: string;
  status: "submitted" | "under_review" | "approved" | "rejected";
  resolution?: string;
  createdAt: number;
}

const CLAIM_STATUS_COPY: Record<
  ClaimInfo["status"],
  { label: string; note: string }
> = {
  submitted: {
    label: "Sent to the shop",
    note: "The shop is looking into it — the decision appears here on this page.",
  },
  under_review: {
    label: "Under review",
    note: "The shop has your claim and is checking it. Track this order to see the decision.",
  },
  approved: {
    label: "Claim approved",
    note: "The shop will contact you on the number you ordered with to arrange the replacement, repair or refund.",
  },
  rejected: {
    label: "Not approved",
    note: "The shop could not honour this claim. If that seems wrong, contact them with the order ID and they will look at it case by case.",
  },
};

const fmtDate = (ms: number): string =>
  new Date(ms).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

export default function WarrantyPanel({ order }: { order: Order }) {
  const deliveredAt = useMemo(
    () => order.timeline.find((t) => t.status === "delivered")?.at,
    [order],
  );
  const warranted = useMemo(
    () => order.items.filter((it) => (it.warrantyDays ?? 0) > 0),
    [order],
  );

  const [claims, setClaims] = useState<ClaimInfo[]>([]);
  const [claimsLoaded, setClaimsLoaded] = useState(false);
  const [openFor, setOpenFor] = useState<string | null>(null);
  const [problem, setProblem] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [justSent, setJustSent] = useState<string | null>(null);

  // Fetch this order's claims. TrackView keys the panel by order.id, so a
  // new lookup remounts the component with fresh state — no reset here.
  useEffect(() => {
    let live = true;
    fetch(
      `/api/warranty?id=${encodeURIComponent(order.id)}&phone=${encodeURIComponent(order.customer.phone)}`,
    )
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (live && Array.isArray((data as { claims?: unknown } | null)?.claims)) {
          setClaims((data as { claims: ClaimInfo[] }).claims);
        }
        if (live) setClaimsLoaded(true);
      })
      .catch(() => {
        if (live) setClaimsLoaded(true);
      });
    return () => {
      live = false;
    };
  }, [order.id, order.customer.phone]);

  // ---- Guards (after the hooks, like ReturnPanel) --------------------------
  if (order.status !== "delivered") return null;
  if (warranted.length === 0) return null;
  if (order.isReturn) return null;

  const claimFor = (productId: string): ClaimInfo | undefined =>
    claims.find((c) => c.productId === productId);

  const windowEnd = (item: OrderItem): number | null =>
    deliveredAt !== undefined
      ? deliveredAt + (item.warrantyDays ?? 0) * DAY_MS
      : null;

  const submit = async (item: OrderItem) => {
    if (problem.trim().length < 5) {
      setError("Tell the shop a little more — a sentence is enough.");
      return;
    }
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/warranty", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: order.id,
          phone: order.customer.phone,
          productId: item.productId,
          problem: problem.trim(),
        }),
      });
      const data = (await res.json().catch(() => null)) as {
        claim?: { id: string };
        error?: string;
      } | null;
      if (res.ok && data?.claim?.id) {
        setJustSent(item.productId);
        setOpenFor(null);
        setProblem("");
        fetch(
          `/api/warranty?id=${encodeURIComponent(order.id)}&phone=${encodeURIComponent(order.customer.phone)}`,
        )
          .then((r) => (r.ok ? r.json() : null))
          .then((d) => {
            if (Array.isArray((d as { claims?: unknown } | null)?.claims)) {
              setClaims((d as { claims: ClaimInfo[] }).claims);
            }
          })
          .catch(() => undefined);
      } else {
        setError(data?.error ?? "The claim could not be sent — try again.");
      }
    } catch {
      setError("Could not reach the shop — check your connection and try again.");
    } finally {
      setSending(false);
    }
  };

  return (
    <section
      aria-label="Warranty"
      className="rounded-3xl bg-paper p-6 ring-1 ring-line"
    >
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-forest-100 text-forest-800 ring-1 ring-forest-200">
          <IconShield className="h-4.5 w-4.5" />
        </span>
        <h3 className="text-[0.7rem] font-semibold uppercase tracking-[0.24em] text-ink-soft">
          Warranty on this order
        </h3>
      </div>
      <ul className="mt-4 divide-y divide-line">
        {warranted.map((item) => {
          const claim = claimFor(item.productId);
          const end = windowEnd(item);
          // eslint-disable-next-line react-hooks/purity -- the warranty window can only be evaluated against the wall clock at render
          const expired = end !== null && Date.now() > end;
          const copy = claim ? CLAIM_STATUS_COPY[claim.status] : null;
          const tone =
            claim?.status === "approved"
              ? "emerald"
              : claim?.status === "rejected"
                ? "rose"
                : claim
                  ? "gold"
                  : null;
          return (
            <li key={item.productId} className="py-4 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink">{item.name}</p>
                  <p className="mt-0.5 text-xs text-ink-soft">
                    {item.warrantyDays}-day warranty
                    {end !== null && (
                      <>
                        {" · until "}
                        <strong className="text-ink">{fmtDate(end)}</strong>
                      </>
                    )}
                  </p>
                </div>
                {claim && copy ? (
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-bold ${
                      tone === "emerald"
                        ? "bg-emerald-100 text-emerald-900"
                        : tone === "rose"
                          ? "bg-rose-100 text-rose-800"
                          : "bg-gold-200 text-gold-800"
                    }`}
                  >
                    {copy.label}
                  </span>
                ) : expired ? null : !claimsLoaded ? (
                    <span className="text-xs text-ink-soft">Checking…</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setOpenFor(openFor === item.productId ? null : item.productId);
                        setError(null);
                      }}
                      className="inline-flex items-center gap-1.5 rounded-full bg-forest-800 px-4 py-2 text-xs font-semibold text-ivory-50 transition-colors hover:bg-forest-700"
                    >
                      {openFor === item.productId ? (
                        <IconClose className="h-3.5 w-3.5" />
                      ) : (
                        <IconShield className="h-3.5 w-3.5" />
                      )}
                      {openFor === item.productId ? "Close" : "Report a problem"}
                    </button>
                  )}
              </div>

              {claim && copy && (
                <p className="mt-2 max-w-md text-xs leading-5 text-ink-soft">
                  {copy.note}
                  {claim.resolution && (
                    <span className="mt-1 block">
                      <strong className="text-ink">Shop note:</strong>{" "}
                      {claim.resolution}
                    </span>
                  )}
                </p>
              )}
              {claimsLoaded && !claim && end !== null && expired && (
                <p className="mt-2 max-w-md text-xs leading-5 text-ink-soft">
                  The warranty window for this item ended on {fmtDate(end)}.
                  If it has a fault, contact the shop with the order ID and
                  they will look at it case by case.
                </p>
              )}
              {claimsLoaded && !claim && end === null && (
                <p className="mt-2 max-w-md text-xs leading-5 text-ink-soft">
                  We cannot confirm the delivery date of this order, so the
                  warranty window is not shown. Contact the shop with the
                  order ID and they will check it.
                </p>
              )}

              {openFor === item.productId && !claim && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void submit(item);
                  }}
                  className="mt-3"
                >
                  <textarea
                    value={problem}
                    onChange={(e) => {
                      setProblem(e.target.value);
                      if (error) setError(null);
                    }}
                    rows={3}
                    maxLength={500}
                    placeholder="e.g. The zipper on the handbag stopped closing after two days of use."
                    className="w-full resize-y rounded-2xl bg-ivory-50 px-4 py-3 text-sm text-ink ring-1 ring-line placeholder:text-ink-soft/50 focus:outline-none focus:ring-2 focus:ring-forest-500"
                  />
                  {error && (
                    <p role="alert" className="mt-2 text-xs font-medium text-rose-800">
                      {error}
                    </p>
                  )}
                  <button
                    type="submit"
                    disabled={sending || !claimsLoaded}
                    className="mt-2 inline-flex h-11 items-center justify-center rounded-full bg-forest-800 px-5 text-xs font-semibold text-ivory-50 transition-colors hover:bg-forest-700 disabled:opacity-60"
                  >
                    {sending ? "Sending…" : "Send claim to the shop"}
                  </button>
                </form>
              )}
            </li>
          );
        })}
      </ul>
      {justSent !== null && (
        <p className="mt-3 flex items-center gap-2 rounded-2xl bg-emerald-50 px-4 py-3 text-xs leading-5 text-emerald-900 ring-1 ring-emerald-200">
          <IconCheck className="h-4 w-4 shrink-0" />
          Claim sent — the shop will review it and the decision appears here.
        </p>
      )}
    </section>
  );
}
