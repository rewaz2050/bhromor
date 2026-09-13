"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useOrders } from "@/lib/use-orders";
import { useSettings } from "@/lib/use-settings";
import { salesReport } from "@/lib/reports";
import { formatPaisa } from "@/lib/format";
import { StatusBadge } from "@/components/admin/order-ui";
import { IconBanknote, IconCard, IconCheck } from "@/components/ui/icons";

/**
 * Payments — P1 #8: Cash on delivery + bKash/Nagad into the shop's OWN
 * wallet (no merchant account, no PSP keys, no settlement).
 *
 * A wallet method goes live the moment the shop saves a plausible BD mobile
 * number here (ops settings → site_settings['ops'].wallets); the checkout
 * offers it, the customer sends the total and shares the TRXID, and the shop
 * verifies the payment from the order page. This page never holds secrets —
 * a wallet number is something the shop would print on a shop board anyway.
 */

export default function AdminPaymentsPage() {
  const { orders } = useOrders();
  const { settings, save: saveSettings } = useSettings();

  const [bkash, setBkash] = useState(settings.wallets.bkash);
  const [nagad, setNagad] = useState(settings.wallets.nagad);
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  // Live settings arrive async — adopt them once.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot adoption
    setBkash(settings.wallets.bkash);
    setNagad(settings.wallets.nagad);
  }, [settings.wallets.bkash, settings.wallets.nagad]);

  const ledger = useMemo(() => salesReport(orders, { days: null, label: "All time" }), [orders]);
  const today = useMemo(() => salesReport(orders, { days: 7, label: "7 days" }), [orders]);

  const cashBook = useMemo(
    () =>
      [...orders]
        .filter((o) => o.status !== "cancelled")
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 6),
    [orders],
  );

  const pendingWallets = useMemo(
    () =>
      orders.filter(
        (o) =>
          o.payment && o.payment !== "cod" &&
          o.paymentStatus === "pending_verification" &&
          o.status !== "cancelled",
      ).length,
    [orders],
  );

  const kpis = [
    {
      label: "Booked (all time)",
      value: formatPaisa(ledger.summary.booked),
      note: `${ledger.summary.orders} live orders`,
    },
    {
      label: "Collected at delivery",
      value: formatPaisa(ledger.summary.collected),
      note: `${formatPaisa(ledger.summary.outstanding)} outstanding`,
    },
    {
      label: "Last 7 days",
      value: formatPaisa(today.summary.booked),
      note: `${today.summary.orders} orders · ${today.summary.cancelled} cancelled`,
    },
    {
      label: "Wallet payments to verify",
      value: String(pendingWallets),
      note: pendingWallets > 0
        ? "Open the order — verify or reject the TRXID"
        : "All wallet payments verified or rejected",
    },
  ];

  const saveWallets = () => {
    setSaving(true);
    void saveSettings({ ...settings, wallets: { bkash, nagad } }).then((ok) => {
      setSaving(false);
      setFlash(
        ok
          ? "Wallet number(s) saved — checkout offers the method immediately. Blank = method hidden."
          : "Could not save — please try again",
      );
    });
  };

  const walletRow = (id: "bkash" | "nagad", name: string) => {
    const value = id === "bkash" ? bkash : nagad;
    const digits = value.replace(/\D/g, "");
    const configured = /^01\d{9}$/.test(digits);
    const set = id === "bkash" ? setBkash : setNagad;
    return (
      <li
        key={id}
        className={`flex flex-wrap items-center gap-4 rounded-xl px-4 py-3.5 ring-1 ${
          configured ? "bg-forest-50/60 ring-forest-200" : "bg-white ring-line"
        }`}
      >
        <span
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${
            configured ? "bg-forest-800 text-ivory-50" : "bg-ivory-100 text-ink-soft"
          }`}
        >
          <IconCard className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-ink">
            {name}
            <span
              className={`rounded-full px-2 py-0.5 text-[0.62rem] font-bold uppercase tracking-wider ${
                configured
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-gold-100 text-gold-700"
              }`}
            >
              {configured ? "Active" : "Add your number"}
            </span>
          </p>
          <p className="mt-0.5 text-xs leading-5 text-ink-soft">
            Customer sends the total to your {name} number, shares the TRXID;
            you verify it from the order page. No merchant account needed.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            value={value}
            onChange={(e) => set(e.target.value)}
            placeholder="01XXXXXXXXX"
            inputMode="tel"
            aria-label={`${name} wallet number`}
            className="h-10 w-40 rounded-xl bg-ivory-50 px-3 font-mono text-sm text-ink ring-1 ring-line focus:outline-none focus:ring-2 focus:ring-forest-500"
          />
          {configured && <IconCheck className="h-5 w-5 shrink-0 text-emerald-600" />}
        </div>
      </li>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-lg font-medium text-forest-900">Payments</h2>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-ink-soft">
          <strong className="font-semibold text-ink">Cash on delivery</strong> is
          the default; <strong className="font-semibold text-ink">bKash and
          Nagad</strong> take money into the shop&apos;s OWN wallet — no merchant
          account, no PSP keys. Save your wallet numbers below and checkout
          offers the method immediately; the customer shares the TRXID and you
          verify it before the order starts.
        </p>
      </div>

      {flash && (
        <p
          role="status"
          className="flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800 ring-1 ring-emerald-200"
        >
          <IconCheck className="h-4 w-4" /> {flash}
        </p>
      )}

      {/* Wallet numbers */}
      <section aria-label="Wallet payments" className="rounded-2xl bg-paper p-6 ring-1 ring-line">
        <h3 className="font-display text-base font-medium text-forest-900">
          Your wallet numbers (bKash / Nagad)
        </h3>
        <p className="mt-1 text-xs leading-5 text-ink-soft">
          The number customers send money to — the one printed on your shop
          board. Leave blank to hide the method.
        </p>
        <ul className="mt-4 space-y-3">
          {walletRow("bkash", "bKash")}
          {walletRow("nagad", "Nagad")}
        </ul>
        <button
          type="button"
          onClick={saveWallets}
          disabled={saving}
          className="mt-4 rounded-xl bg-forest-800 px-5 py-2.5 text-sm font-semibold text-ivory-50 transition-colors hover:bg-forest-900 disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save wallet numbers"}
        </button>
      </section>

      {/* Book KPIs */}
      <section aria-label="Book" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-2xl bg-paper p-5 ring-1 ring-line">
            <div className="flex items-center justify-between">
              <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-ink-soft">{k.label}</p>
              <IconBanknote className="h-4 w-4 text-gold-500" />
            </div>
            <p className="mt-2 font-display text-[1.55rem] font-medium leading-none text-forest-900">{k.value}</p>
            <p className="mt-2 text-xs text-ink-soft">{k.note}</p>
          </div>
        ))}
      </section>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Methods */}
        <section aria-label="Payment methods" className="rounded-2xl bg-paper p-6 ring-1 ring-line lg:col-span-3">
          <h3 className="font-display text-base font-medium text-forest-900">Methods</h3>
          <ul className="mt-4 space-y-3">
            <li className="flex items-center gap-4 rounded-xl bg-forest-50/60 px-4 py-3.5 ring-1 ring-forest-200">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-forest-800 text-ivory-50">
                <IconBanknote className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-ink">
                  Cash on delivery
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[0.62rem] font-bold uppercase tracking-wider text-emerald-800">
                    Active
                  </span>
                </p>
                <p className="mt-0.5 text-xs leading-5 text-ink-soft">
                  Customer pays the courier at the doorstep — no verification
                  step, collected on delivery.
                </p>
              </div>
              <IconCheck className="h-5 w-5 shrink-0 text-emerald-600" />
            </li>
            <li className="flex items-center gap-4 rounded-xl bg-white px-4 py-3.5 ring-1 ring-line">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-ivory-100 text-ink-soft">
                <IconCard className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-ink">
                  Rocket (DBBL)
                  <span className="rounded-full bg-gold-100 px-2 py-0.5 text-[0.62rem] font-bold uppercase tracking-wider text-gold-700">
                    Coming soon
                  </span>
                </p>
                <p className="mt-0.5 text-xs leading-5 text-ink-soft">
                  Same wallet-TRXID flow as bKash/Nagad — one more row in the
                  settings when the shop keeps a Rocket number.
                </p>
              </div>
            </li>
            <li className="flex items-center gap-4 rounded-xl bg-white px-4 py-3.5 ring-1 ring-line">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-ivory-100 text-ink-soft">
                <IconCard className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-ink">
                  Cards (Visa · Mastercard · AmEx)
                  <span className="rounded-full bg-gold-100 px-2 py-0.5 text-[0.62rem] font-bold uppercase tracking-wider text-gold-700">
                    Coming soon
                  </span>
                </p>
                <p className="mt-0.5 text-xs leading-5 text-ink-soft">
                  Needs a PSP (SSLCommerz/Stripe) merchant account — wired
                  server-side when the keys exist; COD stays available either
                  way.
                </p>
              </div>
            </li>
          </ul>
        </section>

        {/* Latest cash book */}
        <section aria-label="Latest cash book" className="rounded-2xl bg-paper p-6 ring-1 ring-line lg:col-span-2">
          <div className="flex items-baseline justify-between">
            <h3 className="font-display text-base font-medium text-forest-900">Cash book</h3>
            <Link
              href="/admin/orders"
              className="text-xs font-semibold uppercase tracking-widest text-forest-700 hover:text-forest-900"
            >
              All orders
            </Link>
          </div>
          {cashBook.length === 0 ? (
            <p className="mt-4 text-sm text-ink-soft">No orders yet — the book starts with the first checkout.</p>
          ) : (
            <ul className="mt-3 divide-y divide-line">
              {cashBook.map((o) => (
                <li key={o.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <Link
                      href={`/admin/orders/${o.id}`}
                      className="text-sm font-semibold text-forest-800 hover:text-forest-900"
                    >
                      {o.id}
                    </Link>
                    <p className="truncate text-xs text-ink-soft">
                      {o.customer.name} · {o.zoneName}
                      {o.payment && o.payment !== "cod" && (
                        <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[0.6rem] font-bold uppercase text-amber-900">
                          {o.payment === "bkash" ? "bKash" : "Nagad"}
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <StatusBadge status={o.status} />
                    <p className="mt-1 text-sm font-semibold tabular-nums text-ink">{formatPaisa(o.total)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-4 border-t border-line pt-3 text-xs leading-5 text-ink-soft">
            COD value is collected only when a courier marks the order
            delivered (§34). Wallet orders count as booked the moment the
            customer places them, and are verified order by order.
          </p>
        </section>
      </div>
    </div>
  );
}
