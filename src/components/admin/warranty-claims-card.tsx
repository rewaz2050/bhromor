"use client";

/**
 * Warranty claims card on the admin order detail page (P1 #14).
 *
 * Fetches this order's claims from /api/admin/warranty?order=… and renders
 * each with the shop's decision controls. 'Review' is a soft acknowledge;
 * approve/reject are terminal and take a note the customer sees on the
 * track page. The replacement or refund itself is the shop's offline
 * handling — the card records the decision, not the cash.
 */

import { useCallback, useEffect, useState } from "react";
import { IconShield } from "@/components/ui/icons";

interface ClaimInfo {
  id: string;
  productId: string;
  productName: string;
  customerName: string;
  customerPhone: string;
  problem: string;
  status: "submitted" | "under_review" | "approved" | "rejected";
  resolution?: string;
  createdAt: number;
  decidedAt?: number;
}

const STATUS_LABEL: Record<ClaimInfo["status"], string> = {
  submitted: "Submitted — awaiting review",
  under_review: "Under review",
  approved: "Approved",
  rejected: "Rejected",
};

const STATUS_CLASS: Record<ClaimInfo["status"], string> = {
  submitted: "bg-gold-100 text-gold-800",
  under_review: "bg-sky-100 text-sky-800",
  approved: "bg-emerald-100 text-emerald-900",
  rejected: "bg-rose-100 text-rose-800",
};

const fmt = (ms?: number): string =>
  ms
    ? new Date(ms).toLocaleString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

export default function WarrantyClaimsCard({ orderNo }: { orderNo: string }) {
  const [claims, setClaims] = useState<ClaimInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/admin/warranty?order=${encodeURIComponent(orderNo)}`,
      );
      const data = (await res.json().catch(() => null)) as {
        claims?: ClaimInfo[];
        error?: string;
      } | null;
      if (res.ok && Array.isArray(data?.claims)) {
        setClaims(data.claims);
        setError(null);
      } else {
        setError(data?.error ?? "Could not load warranty claims.");
      }
    } catch {
      setError("Could not load warranty claims.");
    }
  }, [orderNo]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- order switch refetches the card's claims
    void refresh();
  }, [refresh]);

  const act = async (claim: ClaimInfo, action: "review" | "approve" | "reject") => {
    let note: string | undefined;
    if (action !== "review") {
      const prompted = window.prompt(
        action === "approve"
          ? "Approve this claim? Note the customer will see (what you will do — replace, repair, refund):"
          : "Reject this claim? Tell the customer why (they will see it):",
      );
      if (prompted === null) return; // dismissed
      note = prompted.trim();
      if (action === "reject" && note === "") {
        setError("A rejection needs a note the customer can see.");
        return;
      }
    }
    setBusy(`${claim.id}:${action}`);
    setError(null);
    try {
      const res = await fetch(`/api/admin/warranty/${claim.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, note }),
      });
      const data = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!res.ok) {
        setError(data?.error ?? "The action failed — try again.");
        return;
      }
      await refresh();
    } catch {
      setError("The action failed — check your connection.");
    } finally {
      setBusy(null);
    }
  };

  if (claims === null) {
    return null; // still loading — keep the page quiet
  }
  if (claims.length === 0) return null; // no claims on this order

  return (
    <section
      aria-label="Warranty claims"
      className="rounded-2xl bg-paper p-6 ring-1 ring-line lg:col-span-2"
    >
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-forest-100 text-forest-800 ring-1 ring-forest-200">
          <IconShield className="h-4 w-4" />
        </span>
        <h3 className="text-[0.7rem] font-semibold uppercase tracking-[0.2em] text-ink-soft">
          Warranty claims on this order
        </h3>
      </div>
      <ul className="mt-4 divide-y divide-line">
        {claims.map((c) => (
          <li key={c.id} className="py-4 first:pt-0 last:pb-0">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink">
                  {c.productName}
                </p>
                <p className="mt-0.5 text-xs text-ink-soft">
                  {c.customerName} · {c.customerPhone} ·{" "}
                  {fmt(c.createdAt)}
                </p>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-xs font-bold ${STATUS_CLASS[c.status]}`}
              >
                {STATUS_LABEL[c.status]}
              </span>
            </div>
            <p className="mt-2 text-sm leading-6 text-ink">“{c.problem}”</p>
            {c.resolution && (
              <p className="mt-1.5 text-xs leading-5 text-ink-soft">
                <span className="font-semibold text-ink">Note:</span>{" "}
                {c.resolution}
                {c.decidedAt ? ` · ${fmt(c.decidedAt)}` : ""}
              </p>
            )}
            {(c.status === "submitted" || c.status === "under_review") && (
              <div className="mt-3 flex flex-wrap gap-2">
                {c.status === "submitted" && (
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => void act(c, "review")}
                    className="rounded-full bg-paper px-3.5 py-1.5 text-xs font-semibold text-ink ring-1 ring-line transition-colors hover:ring-forest-400 disabled:opacity-60"
                  >
                    {busy === `${c.id}:review` ? "Marking…" : "Mark as reviewing"}
                  </button>
                )}
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void act(c, "approve")}
                  className="rounded-full bg-emerald-700 px-3.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-600 disabled:opacity-60"
                >
                  {busy === `${c.id}:approve` ? "Approving…" : "Approve"}
                </button>
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void act(c, "reject")}
                  className="rounded-full bg-paper px-3.5 py-1.5 text-xs font-semibold text-rose-700 ring-1 ring-rose-300 transition-colors hover:bg-rose-50 disabled:opacity-60"
                >
                  {busy === `${c.id}:reject` ? "Rejecting…" : "Reject"}
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {error && (
        <p role="alert" className="mt-3 text-xs font-medium text-rose-800">
          {error}
        </p>
      )}
    </section>
  );
}
