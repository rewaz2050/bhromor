"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useOrders } from "@/lib/use-orders";
import { salesReport } from "@/lib/reports";
import { formatPaisa } from "@/lib/format";
import { IconBanknote, IconCard, IconCheck } from "@/components/ui/icons";
import { StatusBadge } from "@/components/admin/order-ui";

/**
 * Payments — launch policy: Cash on Delivery only (§20–21, §26).
 * Online gateways (bKash/Nagad/cards) are planned next; the blueprint wires
 * real PSP keys server-side, so this screen shows the COD book + the
 * roadmap, never fake credentials.
 */

interface MethodRow {
  id: string;
  name: string;
  note: string;
  state: "active" | "soon";
  chip?: string;
}

const METHODS: MethodRow[] = [
  {
    id: "cod",
    name: "Cash on delivery",
    note: "Customer pays the courier at the doorstep — the only method taking orders today.",
    state: "active",
    chip: "Active",
  },
  { id: "bkash", name: "bKash", note: "Merchant number + payment-request flow.", state: "soon", chip: "Coming soon" },
  { id: "nagad", name: "Nagad", note: "Merchant number + payment-request flow.", state: "soon", chip: "Coming soon" },
  { id: "rocket", name: "Rocket (DBBL)", note: "Merchant number + payment-request flow.", state: "soon", chip: "Coming soon" },
  { id: "cards", name: "Visa · Mastercard · AmEx", note: "Via a gateway (SSLCommerz/Stripe) — card on delivery stays available.", state: "soon", chip: "Coming soon" },
];

export default function AdminPaymentsPage() {
  const { orders } = useOrders();

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

  const kpis = [
    {
      label: "COD booked (all time)",
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
      label: "All orders are COD",
      value: "100%",
      note: "payment field is locked to “cod” (§26)",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-lg font-medium text-forest-900">Payments</h2>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-ink-soft">
          Launch accepts <strong className="font-semibold text-ink">Cash on delivery only</strong> — the
          safest start for a rapid-delivery market. Online methods arrive in the
          next phase; their keys belong in <code className="rounded bg-ivory-100 px-1 py-0.5 text-xs">.env</code>{" "}
          (see <code className="rounded bg-ivory-100 px-1 py-0.5 text-xs">.env.example</code>) and are wired
          server-side — this page never holds credentials.
        </p>
      </div>

      {/* COD book KPIs */}
      <section aria-label="COD book" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
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
            {METHODS.map((m) => (
              <li
                key={m.id}
                className={`flex items-center gap-4 rounded-xl px-4 py-3.5 ring-1 ${
                  m.state === "active"
                    ? "bg-forest-50/60 ring-forest-200"
                    : "bg-white ring-line"
                }`}
              >
                <span
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${
                    m.state === "active" ? "bg-forest-800 text-ivory-50" : "bg-ivory-100 text-ink-soft"
                  }`}
                >
                  <IconCard className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-ink">
                    {m.name}
                    <span
                      className={`rounded-full px-2 py-0.5 text-[0.62rem] font-bold uppercase tracking-wider ${
                        m.state === "active"
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-gold-100 text-gold-700"
                      }`}
                    >
                      {m.chip}
                    </span>
                  </p>
                  <p className="mt-0.5 text-xs leading-5 text-ink-soft">{m.note}</p>
                </div>
                {m.state === "active" && <IconCheck className="h-5 w-5 shrink-0 text-emerald-600" />}
              </li>
            ))}
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
            COD value is collected only when a courier marks the order delivered
            (§34) — the KPI cards above already respect that rule.
          </p>
        </section>
      </div>
    </div>
  );
}
