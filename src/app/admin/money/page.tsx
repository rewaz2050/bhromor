"use client";

/**
 * Admin → Money (202609300002, audit item M).
 *
 * The platform's money position in one screen: what came in (commission,
 * delivery charge, tips), what is owed out (riders + shops), how much COD
 * cash riders are carrying, and the rider payout queue. Plus the three pay
 * rates that decide what a delivery credits into a rider's wallet.
 *
 * Honest by construction: every number is derived from the ledgers by
 * `ps_admin_money_summary`, and until the owner sets real rates the page says
 * "not configured" instead of pretending ৳0 is a policy.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import AdminOnly from "@/components/admin/admin-only";
import { formatBdt } from "@/lib/format";
import { computeNet, PNL_RANGES, type PnlRange } from "@/lib/money-pnl";
import {
  useAdminMoney,
  type RiderPayoutQueueRowView,
} from "@/lib/use-admin-money";

const fmtWhen = (ts: number): string =>
  ts > 0 ? new Date(ts).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";

const RANGE_LABEL: Record<PnlRange, string> = {
  today: "Today",
  "7d": "7 days",
  "30d": "30 days",
  all: "All time",
};

const signed = (paisa: number): string => (paisa < 0 ? `−${formatBdt(-paisa)}` : formatBdt(paisa));

const Line = ({
  label,
  value,
  sign,
  hint,
  testId,
}: {
  label: string;
  value: number;
  sign: "+" | "−" | "";
  hint?: string;
  testId?: string;
}) => (
  <div className="flex items-baseline justify-between gap-3 px-4 py-2.5 text-sm" data-testid={testId}>
    <div>
      <p className="text-forest-900">
        <span className="mr-2 inline-block w-3 text-ink-soft">{sign}</span>
        {label}
      </p>
      {hint && <p className="ml-5 text-[11px] text-ink-soft">{hint}</p>}
    </div>
    <p className="font-semibold tabular-nums text-forest-900">{formatBdt(Math.abs(value))}</p>
  </div>
);

const paisaToTaka = (paisa: number): string => String(Math.round(paisa) / 100);

const Card = ({
  label,
  value,
  hint,
  tone = "light",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "light" | "dark" | "warn";
}) => (
  <div
    className={
      tone === "dark"
        ? "rounded-2xl bg-forest-800 p-5 ring-1 ring-forest-800"
        : tone === "warn"
          ? "rounded-2xl bg-amber-50 p-5 ring-1 ring-amber-200"
          : "rounded-2xl bg-paper p-5 ring-1 ring-line"
    }
  >
    <p
      className={
        tone === "dark"
          ? "text-xs font-semibold uppercase tracking-wider text-forest-100"
          : "text-xs font-semibold uppercase tracking-wider text-ink-soft"
      }
    >
      {label}
    </p>
    <p
      className={
        tone === "dark"
          ? "mt-1 font-display text-2xl text-white"
          : "mt-1 font-display text-2xl text-forest-900"
      }
    >
      {value}
    </p>
    {hint && (
      <p className={tone === "dark" ? "mt-1 text-[11px] text-forest-100" : "mt-1 text-[11px] text-ink-soft"}>
        {hint}
      </p>
    )}
  </div>
);

export default function AdminMoneyPage() {
  const money = useAdminMoney();
  const { summary, settings, pending, decided } = money;

  // Rate editor is in TAKA (what the owner types); saved as paisa. The draft
  // is null until the owner types, so the server's rates need no syncing
  // effect — the fields simply show what the database says.
  const [ratesDraft, setRatesDraft] = useState<{
    baseFee: string;
    codFee: string;
    minPayout: string;
  } | null>(null);
  const rates = useMemo(
    () =>
      ratesDraft ?? {
        baseFee: settings ? paisaToTaka(settings.baseFee) : "",
        codFee: settings ? paisaToTaka(settings.codHandlingFee) : "",
        minPayout: settings ? paisaToTaka(settings.minPayout) : "",
      },
    [ratesDraft, settings],
  );
  const [savingRates, setSavingRates] = useState(false);
  const [ratesSaved, setRatesSaved] = useState(false);
  const [acting, setActing] = useState<string | null>(null);
  const [actionForm, setActionForm] = useState<{ id: string; decision: "paid" | "rejected" } | null>(null);
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const setRate = (field: "baseFee" | "codFee" | "minPayout", value: string) =>
    setRatesDraft({ ...rates, [field]: value });

  const saveRates = async () => {
    const toPaisa = (value: string): number | null => {
      const n = Number(value);
      if (!Number.isFinite(n) || n < 0) return null;
      return Math.round(n * 100);
    };
    const next = {
      baseFee: toPaisa(rates.baseFee),
      codHandlingFee: toPaisa(rates.codFee),
      minPayout: toPaisa(rates.minPayout),
    };
    if (next.baseFee === null || next.codHandlingFee === null || next.minPayout === null) {
      return;
    }
    setSavingRates(true);
    const ok = await money.saveSettings({
      baseFee: next.baseFee,
      codHandlingFee: next.codHandlingFee,
      minPayout: next.minPayout,
    });
    setSavingRates(false);
    setRatesSaved(ok);
    // The next render reads the saved rates straight from `settings`.
    if (ok) setRatesDraft(null);
  };

  const submitDecision = async () => {
    if (!actionForm) return;
    setActing(actionForm.id);
    const ok = await money.decide({
      payoutId: actionForm.id,
      decision: actionForm.decision,
      note,
      reference,
    });
    setActing(null);
    if (ok) {
      setActionForm(null);
      setReference("");
      setNote("");
    }
  };

  if (money.loading) {
    return (
      <div className="space-y-6" role="status" aria-label="Loading money dashboard">
        <div className="h-8 w-48 animate-pulse rounded-lg bg-ivory-200" />
        <div className="h-40 animate-pulse rounded-2xl bg-paper ring-1 ring-line" />
      </div>
    );
  }

  if (!money.live) {
    return (
      <div className="rounded-2xl bg-paper p-8 text-center ring-1 ring-line">
        <h2 className="font-display text-xl text-forest-900">Money needs a staff session</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-ink-soft">
          Sign in with a staff account to see the platform money position and the rider payout
          queue.
        </p>
      </div>
    );
  }

  if (!money.ready || !summary) {
    return (
      <div className="space-y-4">
        {money.error && (
          <p role="alert" className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-800 ring-1 ring-rose-200">
            {money.error}
          </p>
        )}
        <div className="rounded-2xl bg-amber-50 p-6 text-sm text-amber-900 ring-1 ring-amber-200">
          <p className="font-semibold">Rider money backend is not installed yet</p>
          <p className="mt-2">
            Run <code>supabase/migrations/202609300002_rider_money.sql</code> in the Supabase SQL
            editor. Until then riders keep earning ৳0 per delivery and no payout can be filed —
            the rest of the app is unaffected.
          </p>
        </div>
      </div>
    );
  }

  const riderExpense = summary.riderFeesEarned + summary.tipsToRiders;
  const ratesConfigured = summary.baseFee > 0 || summary.codHandlingFee > 0;

  return (
    <div className="space-y-6">
      {money.error && (
        <p role="alert" className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-800 ring-1 ring-rose-200">
          {money.error}{" "}
          <button type="button" onClick={money.clearError} className="font-semibold underline underline-offset-2">
            Dismiss
          </button>
        </p>
      )}

      {!ratesConfigured && (
        <div
          role="status"
          className="rounded-2xl bg-amber-50 p-5 text-sm text-amber-900 ring-1 ring-amber-200"
        >
          <p className="font-semibold">প্রতি-ডেলিভারি রেট এখনো সেট করা হয়নি</p>
          <p className="mt-1">
            ডেলিভারি ও COD হ্যান্ডলিং ফি ৳০ থাকলে rider-এর ওয়ালেটে টিপ ছাড়া কিছু জমা হয় না।
            নিচের “Rider pay rates” ফর্মে আসল রেট দিন — পরের ডেলিভারি থেকেই কার্যকর হবে
            (পুরোনো ডেলিভারিতে ব্যাকফিল হবে না)।
          </p>
        </div>
      )}

      {/* Net result (N7) — what the platform actually keeps */}
      {money.pnl ? (
        (() => {
          const p = money.pnl;
          const n = computeNet(p);
          return (
            <section className="space-y-3" data-testid="net-pnl">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="font-display text-lg font-bold text-forest-900">Net result</h2>
                <div className="inline-flex rounded-full bg-ivory-100 p-1 ring-1 ring-line" role="tablist" aria-label="Period">
                  {PNL_RANGES.map((r) => (
                    <button
                      key={r}
                      type="button"
                      role="tab"
                      aria-selected={money.range === r}
                      onClick={() => money.setRange(r)}
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${money.range === r ? "bg-forest-800 text-white" : "text-ink-soft hover:text-forest-900"}`}
                    >
                      {RANGE_LABEL[r]}
                    </button>
                  ))}
                </div>
              </div>
              <div className="divide-y divide-line rounded-2xl bg-paper ring-1 ring-line">
                <Line sign="+" label="Commission" value={p.commission} hint="Shop ledger, delivered orders" testId="pnl-commission" />
                <Line sign="+" label="Delivery & surcharge charges" value={p.deliveryIncome} hint={`${p.deliveredOrders} delivered orders`} testId="pnl-delivery" />
                {p.shopFundedFreeDelivery > 0 && (
                  <Line sign="+" label="Free delivery paid back by shops" value={p.shopFundedFreeDelivery} />
                )}
                <Line sign="−" label="Rider pay (fees, COD handling, incentives)" value={n.riderCost} hint="Tips excluded — they pass straight through" testId="pnl-rider" />
                <Line sign="−" label="Discounts PROSANTI absorbed" value={n.platformDiscounts} hint={`${formatBdt(p.discountsGiven)} given, ${formatBdt(p.shopFundedDiscounts)} funded by shops`} testId="pnl-discounts" />
                <div className="flex items-baseline justify-between gap-3 bg-forest-800 px-4 py-3 text-white first:rounded-t-2xl last:rounded-b-2xl" data-testid="pnl-net">
                  <p className="text-sm font-semibold uppercase tracking-wider">Net operating result</p>
                  <p className="font-display text-2xl tabular-nums">{signed(n.net)}</p>
                </div>
              </div>
              <p className="text-[11px] text-ink-soft" data-testid="pnl-unit">
                {n.perOrder === null
                  ? "No delivered orders in this period."
                  : `${signed(n.perOrder)} per delivered order · delivery charges minus rider pay: ${signed(n.deliveryMarginPerOrder ?? 0)} per trip.`}{" "}
                Tips ({formatBdt(p.tipsCollected)} collected, {formatBdt(p.tipsToRiders)} credited to riders
                {n.tipsHeld !== 0 ? `, ${signed(n.tipsHeld)} not yet credited` : ""}) are the riders&apos; money and are not part of the result.
              </p>
            </section>
          );
        })()
      ) : (
        <p className="rounded-xl bg-amber-50 px-3.5 py-2.5 text-xs text-amber-900 ring-1 ring-amber-200" data-testid="pnl-missing">
          Net result needs <code>supabase/migrations/202610010003_money_pnl.sql</code> — run it in the Supabase SQL editor.
        </p>
      )}

      {/* Gross flows, all time */}
      <section className="space-y-3">
        <h2 className="font-display text-lg font-bold text-forest-900">Gross flows <span className="text-sm font-normal text-ink-soft">(all time, not a profit figure)</span></h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Card
            label="Commission"
            value={formatBdt(summary.commissionIncome)}
            hint="Delivered orders — shop ledger"
          />
          <Card
            label="Delivery charge collected"
            value={formatBdt(summary.deliveryIncome)}
            hint={`${summary.deliveredOrders} delivered orders`}
          />
          <Card
            label="Tips collected"
            value={formatBdt(summary.tipsCollected)}
            hint={`${formatBdt(summary.tipsToRiders)} credited to riders`}
          />
          <Card
            label="Rider pay earned"
            value={formatBdt(riderExpense)}
            hint={`fees ${formatBdt(summary.riderFeesEarned)} + tips ${formatBdt(summary.tipsToRiders)}`}
          />
        </div>
      </section>

      {/* Payables + custody */}
      <section className="space-y-3">
        <h2 className="font-display text-lg font-bold text-forest-900">Owed & held</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Card
            tone="dark"
            label="Rider payable (wallet)"
            value={formatBdt(summary.riderPayable)}
            hint={`${formatBdt(summary.riderPayoutsPending)} in ${summary.riderPayoutsPendingCount} pending request(s)`}
          />
          <Card
            label="Rider payouts paid"
            value={formatBdt(summary.riderPayoutsPaid)}
            hint="Lifetime, approved by staff"
          />
          <Card
            label="Shop payable"
            value={formatBdt(summary.shopPayable)}
            hint="Ledger payable − recorded payouts"
          />
          <Card
            tone={summary.codCustody > 0 ? "warn" : "light"}
            label="COD cash in riders' hands"
            value={formatBdt(summary.codCustody)}
            hint={`${formatBdt(summary.codClaimsPending)} claimed & awaiting approval`}
          />
        </div>
        <p className="text-[11px] text-ink-soft">
          {summary.activeRiders} active riders · {summary.onlineRiders} online ·{" "}
          <Link href="/admin/riders" className="font-semibold underline underline-offset-2">
            Riders board
          </Link>{" "}
          ·{" "}
          <Link href="/admin/payouts" className="font-semibold underline underline-offset-2">
            Shop payouts
          </Link>{" "}
          ·{" "}
          <Link href="/admin/money/audit" className="font-semibold underline underline-offset-2">
            Audit trail
          </Link>{" "}
          ·{" "}
          <Link href="/admin/money/daily" className="font-semibold underline underline-offset-2">
            Daily reconciliation
          </Link>
          <AdminOnly>
            {" "}·{" "}
            <Link href="/admin/money/export" className="font-semibold underline underline-offset-2">
              Export CSV
            </Link>
          </AdminOnly>
        </p>
      </section>

      {/* Payout queue */}
      <section className="space-y-3">
        <h2 className="font-display text-lg font-bold text-forest-900">
          Rider payout queue <span className="text-sm font-normal text-ink-soft">(wallet withdrawals)</span>
        </h2>
        <div className="overflow-x-auto rounded-2xl bg-paper ring-1 ring-line">
          {pending.length === 0 ? (
            <p className="px-5 py-4 text-sm text-ink-soft">
              No pending requests. When a rider withdraws from their wallet the request lands here.
            </p>
          ) : (
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-ivory-100 text-left text-[11px] font-semibold uppercase tracking-wider text-ink-soft">
                <tr>
                  <th className="px-4 py-2.5">Rider</th>
                  <th className="px-4 py-2.5">Requested</th>
                  <th className="px-4 py-2.5">Wallet now</th>
                  <th className="px-4 py-2.5">Cash in hand</th>
                  <th className="px-4 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {pending.map((row: RiderPayoutQueueRowView) => (
                  <tr key={row.id}>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-forest-900">{row.riderName}</p>
                      <p className="text-[11px] text-ink-soft">
                        {row.riderPhone || "no phone"} ·{" "}
                        {row.method}
                        {row.account ? ` → ${row.account}` : ""}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-display font-bold text-forest-900">{formatBdt(row.amount)}</p>
                      <p className="text-[11px] text-ink-soft">{fmtWhen(row.requestedAt)}</p>
                    </td>
                    <td className="px-4 py-3 text-ink-soft">
                      {formatBdt(row.earningsBalance)}
                      <p className="text-[11px]">after this hold</p>
                    </td>
                    <td className="px-4 py-3 text-ink-soft">{formatBdt(row.cashInHand)}</td>
                    <td className="px-4 py-3">
                      <AdminOnly note="Payout approve শুধু admin করতে পারে।">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setActionForm({ id: row.id, decision: "paid" });
                            setReference("");
                            setNote("");
                          }}
                          className="rounded-full bg-forest-800 px-3.5 py-1.5 text-[11px] font-semibold text-ivory-50 hover:bg-forest-900"
                        >
                          Mark paid
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setActionForm({ id: row.id, decision: "rejected" });
                            setReference("");
                            setNote("");
                          }}
                          className="rounded-full border border-line bg-paper px-3.5 py-1.5 text-[11px] font-semibold text-ink-soft hover:bg-ivory-100"
                        >
                          Reject
                        </button>
                      </div>
                      </AdminOnly>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {actionForm && (
          <div className="rounded-2xl bg-ivory-100 p-5 ring-1 ring-line">
            <p className="text-sm font-semibold text-forest-900">
              {actionForm.decision === "paid"
                ? "Confirm the money left the office"
                : "Reject the request (the held amount returns to the rider's wallet)"}
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {actionForm.decision === "paid" && (
                <label className="block">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-soft">
                    bKash / bank reference
                  </span>
                  <input
                    type="text"
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    placeholder="TRX1234…"
                    className="mt-1 w-full rounded-xl border border-line bg-paper px-3 py-2 text-sm"
                  />
                </label>
              )}
              <label className="block">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-soft">
                  Note (optional)
                </span>
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-line bg-paper px-3 py-2 text-sm"
                />
              </label>
            </div>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                disabled={acting !== null}
                onClick={() => void submitDecision()}
                className="inline-flex h-10 items-center rounded-full bg-forest-800 px-4 text-xs font-semibold text-ivory-50 hover:bg-forest-900 disabled:opacity-50"
              >
                {acting ? "Saving…" : actionForm.decision === "paid" ? "Confirm paid" : "Confirm reject"}
              </button>
              <button
                type="button"
                onClick={() => setActionForm(null)}
                className="inline-flex h-10 items-center rounded-full border border-line bg-paper px-4 text-xs font-semibold text-ink-soft hover:bg-ivory-100"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {decided.length > 0 && (
          <div className="rounded-2xl bg-paper ring-1 ring-line">
            <h3 className="px-5 pt-4 text-xs font-semibold uppercase tracking-wider text-ink-soft">
              Recently decided
            </h3>
            <ul className="mt-1 divide-y divide-line">
              {decided.map((row) => (
                <li key={row.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-xs">
                  <span className="text-ink-soft">
                    {row.riderName} · {row.method} · {fmtWhen(row.decidedAt ?? row.requestedAt)}
                    {row.reference ? ` · ${row.reference}` : ""}
                    {row.note ? ` · ${row.note}` : ""}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="font-semibold text-forest-900">{formatBdt(row.amount)}</span>
                    <span
                      className={
                        row.status === "paid"
                          ? "rounded-full bg-emerald-50 px-2.5 py-0.5 font-semibold text-emerald-800 ring-1 ring-emerald-200"
                          : "rounded-full bg-rose-50 px-2.5 py-0.5 font-semibold text-rose-800 ring-1 ring-rose-200"
                      }
                    >
                      {row.status}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* Rates */}
      <section className="space-y-3">
        <h2 className="font-display text-lg font-bold text-forest-900">Rider pay rates</h2>
        <div className="rounded-2xl bg-paper p-5 ring-1 ring-line">
          <p className="text-xs text-ink-soft">
            Paid into a rider&apos;s wallet on every completed delivery — the tip is always 100%
            theirs on top. Changes apply from the next delivery; nothing is backfilled into past
            deliveries.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <label className="block">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-soft">
                Per-delivery fee (৳)
              </span>
              <input
                type="number"
                min={0}
                value={rates.baseFee}
                onChange={(e) => setRate("baseFee", e.target.value)}
                className="mt-1 w-full rounded-xl border border-line bg-ivory-50 px-3 py-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-soft">
                COD handling fee (৳)
              </span>
              <input
                type="number"
                min={0}
                value={rates.codFee}
                onChange={(e) => setRate("codFee", e.target.value)}
                className="mt-1 w-full rounded-xl border border-line bg-ivory-50 px-3 py-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-soft">
                Minimum payout (৳)
              </span>
              <input
                type="number"
                min={0}
                value={rates.minPayout}
                onChange={(e) => setRate("minPayout", e.target.value)}
                className="mt-1 w-full rounded-xl border border-line bg-ivory-50 px-3 py-2 text-sm"
              />
            </label>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              onClick={() => void saveRates()}
              disabled={savingRates}
              className="inline-flex h-10 items-center rounded-full bg-forest-800 px-4 text-xs font-semibold text-ivory-50 hover:bg-forest-900 disabled:opacity-50"
            >
              {savingRates ? "Saving…" : "Save rates"}
            </button>
            {ratesSaved && (
              <span role="status" className="text-xs font-semibold text-emerald-800">
                Saved — applies from the next delivery.
              </span>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
