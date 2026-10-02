"use client";

/**
 * Admin → Riders → Disputes (item W, 202610020007): what riders say went wrong
 * with a trip's money, and the decision — approve (optionally crediting or
 * debiting the wallet, journalled + audited) or reject with a reason the rider
 * reads in their inbox.
 */

import Link from "next/link";
import { useState } from "react";
import { formatBdt } from "@/lib/format";
import { disputeCategoryLabel, type AdminDispute } from "@/lib/rider-disputes";
import { useAdminRiderDisputes, type DisputeTab } from "@/lib/use-admin-rider-disputes";

const when = (ts: number): string =>
  new Date(ts).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

function DecideForm({
  dispute,
  onDecide,
}: {
  dispute: AdminDispute;
  onDecide: (body: { decision: "approve" | "reject"; amountTaka?: string; note: string }) => Promise<string | null>;
}) {
  const [amount, setAmount] = useState(dispute.claimedAmount ? String(dispute.claimedAmount / 100) : "");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const go = async (decision: "approve" | "reject") => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const err = await onDecide({ decision, amountTaka: decision === "approve" ? amount : undefined, note });
    setBusy(false);
    if (err) setError(err);
  };

  return (
    <div className="mt-3 grid gap-2 rounded-xl bg-ivory-100 p-3 ring-1 ring-line sm:grid-cols-[10rem_1fr]">
      <label className="text-[11px] font-semibold text-ink-soft">
        Wallet change (৳, − to debit)
        <input
          inputMode="decimal"
          aria-label="Wallet change in taka"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0 = no money"
          className="mt-1 w-full rounded-lg bg-paper px-2.5 py-2 text-sm text-ink ring-1 ring-line"
        />
      </label>
      <label className="text-[11px] font-semibold text-ink-soft">
        Note to the rider (required to reject, or to move money)
        <input
          aria-label="Note to the rider"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="mt-1 w-full rounded-lg bg-paper px-2.5 py-2 text-sm text-ink ring-1 ring-line"
        />
      </label>
      {error && (
        <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-900 ring-1 ring-rose-200 sm:col-span-2">
          {error}
        </p>
      )}
      <div className="flex gap-2 sm:col-span-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void go("approve")}
          className="rounded-full bg-forest-900 px-4 py-2 text-xs font-semibold text-ivory-50 disabled:opacity-40"
        >
          Approve
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void go("reject")}
          className="rounded-full bg-paper px-4 py-2 text-xs font-semibold text-rose-800 ring-1 ring-rose-300 disabled:opacity-40"
        >
          Reject
        </button>
      </div>
    </div>
  );
}

export default function RiderDisputesPage() {
  const [tab, setTab] = useState<DisputeTab>("pending");
  const { live, checked, items, ready, loaded, error, refresh, decide } = useAdminRiderDisputes(tab);

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-4 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl text-forest-900">Rider disputes</h1>
          <p className="mt-1 text-sm text-ink-soft">
            Approving can credit or debit the rider&apos;s wallet; every change is journalled and appears in the money audit log under your name.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => void refresh()} className="rounded-full bg-paper px-3 py-1.5 text-xs font-semibold ring-1 ring-line hover:bg-ivory-100">
            Refresh
          </button>
          <Link href="/admin/riders" className="text-sm font-semibold text-forest-800 underline underline-offset-2">
            ← Riders
          </Link>
        </div>
      </header>

      <div role="tablist" className="flex gap-2">
        {(["pending", "decided"] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-full px-4 py-1.5 text-xs font-semibold ring-1 ${tab === t ? "bg-forest-900 text-ivory-50 ring-forest-900" : "bg-paper text-forest-900 ring-line"}`}
          >
            {t === "pending" ? "Open" : "Decided"}
          </button>
        ))}
      </div>

      {checked && !live && (
        <p className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-200">Staff হিসেবে sign in করুন।</p>
      )}
      {error && (
        <p role="alert" className="rounded-2xl bg-rose-50 p-4 text-sm text-rose-900 ring-1 ring-rose-200">
          {error}
        </p>
      )}
      {live && loaded && !ready && (
        <p data-testid="disputes-missing" className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-200">
          Disputes এখনো চালু হয়নি। Supabase SQL Editor-এ <code>supabase/migrations/202610020007_rider_disputes.sql</code> চালান।
        </p>
      )}
      {live && loaded && ready && items.length === 0 && (
        <p className="rounded-2xl bg-paper p-5 text-sm text-ink-soft ring-1 ring-line">
          {tab === "pending" ? "No open disputes." : "Nothing decided yet."}
        </p>
      )}

      <ul className="space-y-3">
        {items.map((d) => (
          <li key={d.id} data-testid="dispute-row" data-status={d.status} className="rounded-2xl bg-paper p-4 ring-1 ring-line">
            <div className="flex flex-wrap items-center gap-2">
              <Link href={`/admin/riders/${d.riderId}`} className="font-display text-base font-semibold text-forest-900 hover:underline">
                {d.riderName || "Rider"}
              </Link>
              <span className="rounded-full bg-ivory-200 px-2 py-0.5 text-[11px] font-semibold text-ink-soft">{disputeCategoryLabel(d.category, "en")}</span>
              {d.orderNo && <span className="font-mono text-xs text-ink-soft">#{d.orderNo}</span>}
              {d.claimedAmount ? <span className="text-xs font-semibold text-amber-800">claims {formatBdt(d.claimedAmount)}</span> : null}
              <span className="ml-auto text-[11px] text-ink-soft">{when(d.at)}</span>
            </div>
            <p className="mt-2 text-sm text-ink">{d.message}</p>
            {d.status === "pending" ? (
              <DecideForm dispute={d} onDecide={(body) => decide(d.id, body)} />
            ) : (
              <p className="mt-2 text-xs font-semibold text-ink-soft">
                {d.status === "approved" ? "Approved" : "Rejected"}
                {d.adjustmentAmount !== 0 ? ` · wallet ${d.adjustmentAmount > 0 ? "+" : "−"}${formatBdt(Math.abs(d.adjustmentAmount))}` : ""}
                {d.note ? ` · ${d.note}` : ""}
                {d.decidedAt ? ` · ${when(d.decidedAt)}` : ""}
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
