"use client";

/**
 * The shopper's question, on the order the shop is packing (2026-10-13).
 *
 * The Messages tab holds the inbox, but the place a shop actually reads an
 * order is here — and a question asked about THIS order was invisible unless
 * someone went to a different list and picked out the right thread among the
 * rest. Answering from the order also means the answer is next to the stock
 * question it is about.
 *
 * Renders nothing when there is no conversation, which is most orders: a card
 * reading "no messages" on every order is noise the shop learns to skip, and
 * then skips the real one too.
 */

import { useEffect, useState } from "react";

import MessageThread from "@/components/messages/message-thread";
import type { ThreadSummary } from "@/lib/db/customer-threads";

export default function VendorOrderThread({ orderNo }: { orderNo: string }) {
  const [threadId, setThreadId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/vendor/threads?orderNo=${encodeURIComponent(orderNo)}`, {
      cache: "no-store",
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled) return;
        // A 501 (migration not run) leaves this null and the page unchanged.
        const first = (data as { threads?: ThreadSummary[] } | null)?.threads?.[0];
        if (first?.id) setThreadId(first.id);
      })
      .catch(() => {
        /* offline or unconfigured — the order page still works */
      });
    return () => {
      cancelled = true;
    };
  }, [orderNo]);

  if (!threadId) return null;

  return (
    <section
      aria-label="Shopper messages"
      data-testid="vendor-order-thread"
      className="rounded-2xl bg-paper p-5 ring-1 ring-line"
    >
      <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-soft">
        Shopper messages
      </h3>
      <div className="mt-3">
        <MessageThread
          threadId={threadId}
          basePath="/api/vendor/threads"
          self="shop"
          lang="en"
        />
      </div>
    </section>
  );
}
