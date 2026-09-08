"use client";

import { useMemo, useState } from "react";
import { useOrders } from "@/lib/use-orders";
import { formatBdt } from "@/lib/format";
import { normalizePhone } from "@/lib/orders";
import { friendlyWhen } from "@/components/admin/order-ui";
import { IconSearch } from "@/components/ui/icons";

interface CustomerRow {
  name: string;
  phone: string;
  area: string;
  orders: number;
  spent: number;
  lastOrderAt: number;
  cancelled: number;
}

/** §27/§32-style customer view derived from the demo order store. */
export default function AdminCustomersPage() {
  const { orders } = useOrders();
  const [query, setQuery] = useState("");

  const rows = useMemo(() => {
    const map = new Map<string, CustomerRow>();
    for (const o of orders) {
      const key = o.customer.phone.replace(/\D/g, "");
      const row =
        map.get(key) ??
        ({
          name: o.customer.name,
          phone: o.customer.phone,
          area: o.customer.area,
          orders: 0,
          spent: 0,
          lastOrderAt: 0,
          cancelled: 0,
        } satisfies CustomerRow);
      row.orders += 1;
      if (o.status !== "cancelled") row.spent += o.total;
      else row.cancelled += 1;
      row.lastOrderAt = Math.max(row.lastOrderAt, o.createdAt);
      map.set(key, row);
    }
    return [...map.values()].sort((a, b) => b.lastOrderAt - a.lastOrderAt);
  }, [orders]);

  const visible = rows.filter(
    (r) =>
      query.trim() === "" ||
      r.name.toLowerCase().includes(query.trim().toLowerCase()) ||
      r.phone.includes(query.trim()),
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-medium text-forest-900">
            Customers
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            Built from the demo order store — profiles, accounts and saved
            addresses arrive with the account phase (§27).
          </p>
        </div>
        <div className="relative w-full max-w-xs">
          <IconSearch className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name or phone…"
            aria-label="Search customers"
            className="w-full rounded-full border-0 bg-paper py-2.5 pl-10 pr-4 text-sm text-ink ring-1 ring-line placeholder:text-ink-soft/70 focus:outline-none focus:ring-2 focus:ring-forest-600"
          />
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="rounded-2xl bg-paper py-20 text-center ring-1 ring-line">
          <p className="font-display text-lg text-forest-900">No customers found</p>
          <p className="mt-1 text-sm text-ink-soft">
            Customers appear automatically once orders are placed.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl bg-paper ring-1 ring-line">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-line text-[0.68rem] uppercase tracking-[0.16em] text-ink-soft">
                  <th className="px-5 py-3.5 font-semibold">Customer</th>
                  <th className="px-5 py-3.5 font-semibold">Area</th>
                  <th className="px-5 py-3.5 font-semibold">Orders</th>
                  <th className="px-5 py-3.5 text-right font-semibold">Lifetime spend</th>
                  <th className="px-5 py-3.5 font-semibold">Last order</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {visible.map((r) => (
                  <tr key={r.phone} className="transition-colors hover:bg-ivory-100/70">
                    <td className="px-5 py-3.5">
                      <p className="font-medium text-ink">{r.name}</p>
                      <p className="mt-0.5 text-xs text-ink-soft">
                        {/* Full number (staff surface) so orders can be
                            confirmed by phone — masking belongs on public
                            pages, not the ops panel. */}
                        <a
                          href={`tel:+88${normalizePhone(r.phone)}`}
                          className="text-forest-800 underline underline-offset-2"
                        >
                          {r.phone}
                        </a>
                        {r.cancelled > 0 && (
                          <span className="ml-2 rounded-full bg-rose-100 px-2 py-0.5 text-[0.62rem] font-bold text-rose-800">
                            {r.cancelled} cancelled
                          </span>
                        )}
                      </p>
                    </td>
                    <td className="px-5 py-3.5 text-ink-soft">{r.area}</td>
                    <td className="px-5 py-3.5">
                      <span className="rounded-full bg-forest-100 px-2.5 py-1 text-[0.7rem] font-bold text-forest-800">
                        {r.orders}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right font-medium text-ink">
                      {formatBdt(r.spent)}
                    </td>
                    <td className="px-5 py-3.5 text-xs text-ink-soft">
                      {friendlyWhen(r.lastOrderAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
