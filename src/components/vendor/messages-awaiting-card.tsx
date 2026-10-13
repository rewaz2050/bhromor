"use client";

/**
 * "N shoppers are waiting on your reply" (2026-10-13).
 *
 * The vendor panel got a Messages tab, but a tab is not a queue: everything
 * else this dashboard shows — orders, takings, service score — announces
 * itself, and a customer's question is the one thing that does not. So it
 * sat unseen until the shop happened to tap Messages.
 *
 * The card renders only when there is something to answer. "Awaiting your
 * reply" is an open thread whose last message came from the customer, which
 * clears by itself the moment the shop answers — no read marker, no third
 * migration, and nothing that can get stuck.
 */

import Link from "next/link";
import { useVendorThreads } from "@/lib/use-vendor";
import { formatDateTime } from "@/components/vendor/vendor-ui";

export default function MessagesAwaitingCard() {
  const { threads, awaiting, loading } = useVendorThreads(true);
  if (loading || awaiting === 0) return null;

  const waiting = threads
    .filter((t) => t.status === "open" && t.lastSender === "customer")
    .slice(0, 3);

  return (
    <section
      aria-label="Shopper messages awaiting a reply"
      data-testid="messages-awaiting-card"
      className="rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-200"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-sm font-semibold text-forest-900">
          {awaiting === 1
            ? "1 shopper is waiting on your reply"
            : `${awaiting} shoppers are waiting on your reply`}
        </h2>
        <Link
          href="/vendor/messages"
          className="inline-flex min-h-9 items-center rounded-full bg-forest-800 px-4 text-xs font-semibold text-white hover:bg-forest-900"
        >
          Answer
        </Link>
      </div>
      <ul className="mt-3 space-y-2">
        {waiting.map((t) => (
          <li key={t.id} className="text-xs text-forest-900">
            <span className="font-semibold">
              {t.orderNo ? `#${t.orderNo}` : "General question"}
            </span>{" "}
            · {t.lastBody || "(no text)"}
            <span className="text-ink-soft"> · {formatDateTime(t.lastMessageAt)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
