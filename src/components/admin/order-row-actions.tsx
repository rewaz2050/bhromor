"use client";

/**
 * The one next tap for an order, inline in the admin list (2026-09-18).
 *
 * Before this every Confirm meant: open the order page, find the button,
 * press it, go back — four taps × every order, on a phone, while the
 * customer waits. The row now carries the same primary action the detail
 * page computes (`primaryAction`), plus a quiet Cancel where the database
 * allows one. Rider-owned states show who holds the order instead of a
 * button that could not succeed.
 */

import { useState } from "react";
import Link from "next/link";
import type { Order, OrderStatus } from "@/lib/orders";
import { canQuickCancel, primaryAction } from "@/lib/order-actions";
import { IconArrowRight } from "@/components/ui/icons";

interface Props {
  order: Order;
  advance: (id: string, to: OrderStatus, note?: string) => Promise<boolean>;
  cancel: (id: string) => Promise<boolean>;
}

export function OrderRowActions({ order, advance, cancel }: Props) {
  const [busy, setBusy] = useState<"primary" | "cancel" | null>(null);
  const action = primaryAction(order, "staff");
  const cancellable = canQuickCancel(order);

  if (!action && !cancellable) {
    return <span className="text-xs text-ink-soft">—</span>;
  }

  const run = async (kind: "primary" | "cancel", fn: () => Promise<boolean>) => {
    setBusy(kind);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {action?.kind === "action" && (
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => {
            if (action.confirm && !window.confirm(action.confirm)) return;
            void run("primary", () => advance(order.id, action.to, action.note));
          }}
          className="inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full bg-forest-800 px-3.5 text-xs font-semibold text-ivory-50 transition-colors hover:bg-forest-700 disabled:opacity-60"
        >
          {busy === "primary" ? "Saving…" : action.label}
          {busy !== "primary" && <IconArrowRight className="h-3 w-3" />}
        </button>
      )}
      {action?.kind === "blocked" && (
        <Link
          href={action.href ?? `/admin/orders/${order.id}`}
          className="inline-flex h-8 items-center whitespace-nowrap rounded-full bg-amber-100 px-3.5 text-xs font-semibold text-amber-900 ring-1 ring-amber-300 hover:bg-amber-200"
        >
          {action.reason}
        </Link>
      )}
      {action?.kind === "wait" && (
        <span className="whitespace-nowrap text-xs text-ink-soft">{action.reason}</span>
      )}
      {cancellable && (
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => {
            if (!window.confirm(`Cancel order ${order.id}? Reserved stock is released.`)) return;
            void run("cancel", () => cancel(order.id));
          }}
          className="inline-flex h-8 items-center whitespace-nowrap rounded-full px-3 text-xs font-medium text-rose-700 ring-1 ring-rose-200 transition-colors hover:bg-rose-50 disabled:opacity-60"
          aria-label={`Cancel order ${order.id}`}
        >
          {busy === "cancel" ? "Cancelling…" : "Cancel"}
        </button>
      )}
    </div>
  );
}
