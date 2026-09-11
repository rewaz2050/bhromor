"use client";

import { useMemo, useState } from "react";
import { usePayouts } from "@/lib/use-payouts";
import { formatBdt } from "@/lib/format";
import { field, label } from "@/components/admin/form-ui";
import { IconCheck, IconPlus } from "@/components/ui/icons";

const METHODS = ["bank", "bkash", "nagad", "cash"] as const;

const fmtDate = (ts: number): string =>
  new Date(ts).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

/** Marketplace phase 2 — staff payouts: balances, settlement, record. */
export default function AdminPayoutsPage() {
  const [shopId, setShopId] = useState<string | null>(null);
  const { live, loading, balances, ledger, payouts, error, clearError, record } =
    usePayouts(shopId);
  const [paying, setPaying] = useState(false);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<string>("bkash");
  const [reference, setReference] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const selected = useMemo(
    () => balances.find((b) => b.shop.id === shopId) ?? null,
    [balances, shopId],
  );
  const totals = useMemo(() => {
    const earned = balances.reduce((s, b) => s + b.earned, 0);
    const paid = balances.reduce((s, b) => s + b.paid, 0);
    return { earned, paid, balance: earned - paid };
  }, [balances]);

  const submitPayout = async () => {
    if (!selected) return;
    const taka = Number(amount);
    if (!Number.isFinite(taka) || taka <= 0) {
      setFormError("Enter a payout amount above ৳0.");
      return;
    }
    setSaving(true);
    const ok = await record({
      shopId: selected.shop.id,
      amountTaka: taka,
      method,
      reference: reference.trim(),
    });
    setSaving(false);
    if (!ok) return;
    setAmount("");
    setReference("");
    setFormError(null);
    setPaying(false);
  };

  if (loading) {
    return (
      <div className="space-y-6" role="status" aria-label="Loading payouts">
        <div className="h-8 w-48 animate-pulse rounded-lg bg-ivory-200" />
        <div className="h-40 animate-pulse rounded-2xl bg-paper ring-1 ring-line" />
      </div>
    );
  }

  if (!live) {
    return (
      <div className="rounded-2xl bg-paper p-8 text-center ring-1 ring-line">
        <h2 className="font-display text-xl text-forest-900">
          Payouts need a staff session
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-ink-soft">
          Sign in with a staff account to see balances and record payouts.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl bg-paper p-5 ring-1 ring-line">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-soft">
            Vendors earned
          </p>
          <p className="mt-1 font-display text-2xl text-forest-900">
            {formatBdt(totals.earned)}
          </p>
        </div>
        <div className="rounded-2xl bg-paper p-5 ring-1 ring-line">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-soft">
            Paid out
          </p>
          <p className="mt-1 font-display text-2xl text-forest-900">
            {formatBdt(totals.paid)}
          </p>
        </div>
        <div className="rounded-2xl bg-forest-800 p-5 ring-1 ring-forest-800">
          <p className="text-xs font-semibold uppercase tracking-wider text-forest-100">
            Unsettled balance
          </p>
          <p className="mt-1 font-display text-2xl text-white">
            {formatBdt(totals.balance)}
          </p>
        </div>
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-800 ring-1 ring-rose-200"
        >
          {error}{" "}
          <button
            type="button"
            onClick={clearError}
            className="font-semibold underline underline-offset-2"
          >
            Dismiss
          </button>
        </p>
      )}

      <div className="overflow-x-auto rounded-2xl bg-paper ring-1 ring-line">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-ink-soft">
              <th className="px-4 py-3 font-semibold">Shop</th>
              <th className="px-4 py-3 text-right font-semibold">Earned</th>
              <th className="px-4 py-3 text-right font-semibold">Paid</th>
              <th className="px-4 py-3 text-right font-semibold">Balance</th>
              <th className="px-4 py-3 font-semibold">Last payout</th>
              <th className="px-4 py-3 font-semibold">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {balances.map((b) => (
              <tr
                key={b.shop.id}
                className={`border-b border-line/60 last:border-0 ${shopId === b.shop.id ? "bg-forest-50/60" : ""}`}
              >
                <td className="px-4 py-2.5">
                  <span className="font-medium text-forest-900">
                    {b.shop.name}
                  </span>{" "}
                  <span className="text-xs text-ink-soft">
                    ({b.shop.status}
                    {b.shop.isOpen ? ", open" : ", closed"})
                  </span>
                </td>
                <td className="px-4 py-2.5 text-right">
                  {formatBdt(b.earned)}
                </td>
                <td className="px-4 py-2.5 text-right text-ink-soft">
                  {formatBdt(b.paid)}
                </td>
                <td className="px-4 py-2.5 text-right font-semibold text-forest-900">
                  {formatBdt(b.balance)}
                </td>
                <td className="px-4 py-2.5 text-xs text-ink-soft">
                  {b.lastPayoutAt ? fmtDate(b.lastPayoutAt) : "—"}
                </td>
                <td className="px-4 py-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      setShopId(shopId === b.shop.id ? null : b.shop.id);
                      setPaying(false);
                      setFormError(null);
                    }}
                    className="rounded-full px-3 py-1.5 text-xs font-semibold text-forest-800 ring-1 ring-forest-300 hover:bg-forest-800 hover:text-ivory-50"
                  >
                    {shopId === b.shop.id ? "Close" : "Settle"}
                  </button>
                </td>
              </tr>
            ))}
            {balances.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-8 text-center text-sm text-ink-soft"
                >
                  No shops yet — approved shops appear here with their
                  settlement balances.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {selected && (
        <div className="space-y-4 rounded-2xl bg-paper p-5 ring-1 ring-line">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-lg text-forest-900">
              Settlement · {selected.shop.name}
            </h2>
            <button
              type="button"
              disabled={selected.balance <= 0}
              onClick={() => {
                setPaying((v) => !v);
                setAmount(
                  selected.balance > 0
                    ? String(selected.balance / 100)
                    : "",
                );
                setFormError(null);
              }}
              className="inline-flex items-center gap-1.5 rounded-full bg-forest-800 px-4 py-2 text-xs font-semibold text-ivory-50 hover:bg-forest-700 disabled:opacity-50"
            >
              <IconPlus className="h-3.5 w-3.5" />
              {selected.balance > 0 ? "Record payout" : "Nothing to pay"}
            </button>
          </div>

          {paying && (
            <div className="rounded-xl bg-cream/70 p-4 ring-1 ring-line">
              {formError && (
                <p
                  role="alert"
                  className="mb-3 rounded-xl bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-800 ring-1 ring-rose-200"
                >
                  {formError}
                </p>
              )}
              <div className="grid gap-3 sm:grid-cols-4">
                <label className="block">
                  <span className={label}>Amount (৳)</span>
                  <input
                    className={field}
                    type="number"
                    min="1"
                    step="any"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder={String(selected.balance / 100)}
                  />
                </label>
                <label className="block">
                  <span className={label}>Method</span>
                  <select
                    className={field}
                    value={method}
                    onChange={(e) => setMethod(e.target.value)}
                  >
                    {METHODS.map((m) => (
                      <option key={m} value={m}>
                        {m === "bkash" ? "bKash" : m[0].toUpperCase() + m.slice(1)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block sm:col-span-2">
                  <span className={label}>Reference (txn id / note)</span>
                  <input
                    className={field}
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    placeholder="e.g. TRX9X2K7M"
                    maxLength={120}
                  />
                </label>
              </div>
              <p className="mt-2 text-xs text-ink-soft">
                Unsettled: {formatBdt(selected.balance)} — the database
                refuses anything above it, even from two staff at once.
              </p>
              <button
                type="button"
                disabled={saving}
                onClick={() => void submitPayout()}
                className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-forest-800 px-5 py-2 text-xs font-semibold text-ivory-50 hover:bg-forest-700 disabled:opacity-60"
              >
                <IconCheck className="h-3.5 w-3.5" />{" "}
                {saving ? "Recording…" : "Confirm payout"}
              </button>
            </div>
          )}

          <div className="grid gap-6 lg:grid-cols-2">
            <section aria-label="Ledger">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-soft">
                Earned per order
              </h3>
              {ledger.length === 0 ? (
                <p className="rounded-xl bg-cream/70 px-4 py-6 text-center text-sm text-ink-soft ring-1 ring-line">
                  No delivered orders yet — each delivery writes a row here
                  automatically.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {ledger.map((l) => (
                    <li
                      key={l.id}
                      className="flex items-center justify-between gap-3 rounded-xl bg-cream/70 px-3.5 py-2 text-sm ring-1 ring-line"
                    >
                      <span>
                        <span className="font-mono text-xs font-semibold text-forest-900">
                          {l.orderNo || l.orderId.slice(0, 8)}
                        </span>{" "}
                        <span className="text-xs text-ink-soft">
                          {fmtDate(l.at)} · sale {formatBdt(l.subtotal)} −
                          fee {formatBdt(l.commission)}
                        </span>
                      </span>
                      <span className="font-semibold text-forest-900">
                        {formatBdt(l.payable)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section aria-label="Payouts">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-soft">
                Payout history
              </h3>
              {payouts.length === 0 ? (
                <p className="rounded-xl bg-cream/70 px-4 py-6 text-center text-sm text-ink-soft ring-1 ring-line">
                  No payouts recorded for this shop yet.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {payouts.map((p) => (
                    <li
                      key={p.id}
                      className="flex items-center justify-between gap-3 rounded-xl bg-cream/70 px-3.5 py-2 text-sm ring-1 ring-line"
                    >
                      <span>
                        <span className="font-semibold text-forest-900">
                          {formatBdt(p.amount)}
                        </span>{" "}
                        <span className="text-xs text-ink-soft">
                          via {p.method}
                          {p.reference ? ` · ${p.reference}` : ""}
                        </span>
                      </span>
                      <span className="text-xs text-ink-soft">
                        {fmtDate(p.at)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
