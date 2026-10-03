"use client";

/**
 * /rider/inbox — messages from the office: broadcasts to every rider and
 * notes addressed to this rider alone. Opening the page marks them read.
 */

import { useEffect, useRef } from "react";
import { useRiderSession } from "@/lib/use-rider";
import { useRiderInbox } from "@/lib/use-rider-inbox";

const fmtWhen = (ts: number): string =>
  new Date(ts).toLocaleString("bn-BD", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default function RiderInboxPage() {
  const session = useRiderSession();
  const inbox = useRiderInbox(session.status === "authed");
  // Marking read only zeroes the badge count; each item keeps its own unread
  // flag from this load, so the rider still sees which messages are new.
  const marked = useRef(false);
  const { loading, ready, unread, markRead } = inbox;

  useEffect(() => {
    if (loading || !ready || marked.current) return;
    marked.current = true;
    if (unread > 0) void markRead();
  }, [loading, ready, unread, markRead]);

  return (
    <div className="flex-1 pb-24">
      <header className="sticky top-0 z-30 border-b border-line bg-forest-900 px-5 py-4 text-ivory-50">
        <h1 className="font-display text-base font-semibold">অফিসের বার্তা</h1>
        <p className="text-[11px] text-ivory-100/70">নোটিশ ও নির্দেশনা</p>
      </header>

      <div className="space-y-3 p-4">
        {!inbox.loading && !inbox.ready && (
          <p data-testid="inbox-unavailable" className="rounded-2xl bg-amber-50 p-4 text-xs text-amber-900 ring-1 ring-amber-200">
            বার্তা বক্স এখনো চালু হয়নি।
          </p>
        )}

        {!inbox.loading && inbox.ready && inbox.items.length === 0 && (
          <div data-testid="inbox-empty" className="rounded-2xl border border-dashed border-line bg-ivory-100/50 p-8 text-center">
            <p className="text-sm font-semibold text-forest-900">কোনো বার্তা নেই</p>
            <p className="mt-1 text-xs text-ink-soft">অফিস কিছু জানালে এখানে দেখা যাবে।</p>
          </div>
        )}

        <ul className="space-y-3">
          {inbox.items.map((m) => (
            <li
              key={m.id}
              data-testid="inbox-item"
              data-severity={m.severity}
              data-unread={m.unread ? "true" : "false"}
              className={`rounded-2xl border p-4 ${
                m.severity === "important" ? "border-rose-200 bg-rose-50/70" : "border-line bg-paper"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold text-forest-900">
                  {m.unread && <span aria-label="নতুন" className="mr-1.5 inline-block h-2 w-2 rounded-full bg-rose-600" />}
                  {m.severity === "important" ? "❗ " : ""}
                  {m.title}
                </p>
                {m.personal && (
                  <span className="shrink-0 rounded-full bg-forest-100 px-2 py-0.5 text-[10px] font-semibold text-forest-800">আপনার জন্য</span>
                )}
              </div>
              {m.body && <p className="mt-1.5 whitespace-pre-line text-xs text-ink">{m.body}</p>}
              <p className="mt-2 text-[11px] text-ink-soft">{fmtWhen(m.at)}</p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
