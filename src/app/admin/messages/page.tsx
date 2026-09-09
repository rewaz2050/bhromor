"use client";

import { useMemo, useState } from "react";
import { useMessages } from "@/lib/use-messages";
import type { ContactStatus } from "@/lib/engagement";
import { friendlyWhen } from "@/components/admin/order-ui";
import { IconCheck, IconMail, IconPhone } from "@/components/ui/icons";

const FILTERS: ("all" | ContactStatus)[] = ["all", "new", "read", "replied"];

const STATUS_TONE: Record<ContactStatus, string> = {
  new: "bg-forest-800 text-ivory-50",
  read: "bg-ivory-200 text-ink",
  replied: "bg-gold-200 text-forest-950",
};

/** Staff contact inbox — messages from the public contact form. */
export default function AdminMessagesPage() {
  const { messages, setStatus, live, loading, error } = useMessages();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const visible = useMemo(
    () =>
      messages
        .filter((m) => (filter === "all" ? true : m.status === filter))
        .sort((a, b) => b.at - a.at),
    [messages, filter],
  );
  const newCount = useMemo(
    () => messages.filter((m) => m.status === "new").length,
    [messages],
  );

  const mark = async (id: string, status: ContactStatus) => {
    setBusy(id);
    await setStatus(id, status);
    setBusy(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-medium text-forest-900">
            Messages
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            {live
              ? "Contact-form messages from customers, newest first."
              : "Demo inbox — messages sent on this device land here."}
          </p>
        </div>
        {newCount > 0 && (
          <p className="rounded-full bg-forest-800 px-4 py-1.5 text-xs font-semibold text-ivory-50">
            {newCount} new
          </p>
        )}
      </div>

      {error && (
        <p role="alert" className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-rose-200">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter by status">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            role="tab"
            aria-selected={filter === f}
            onClick={() => setFilter(f)}
            className={`rounded-full px-4 py-2 text-xs font-semibold capitalize ring-1 transition-colors ${
              filter === f
                ? "bg-forest-800 text-ivory-50 ring-forest-800"
                : "bg-paper text-ink-soft ring-line hover:text-forest-800"
            }`}
          >
            {f === "all" ? `All (${messages.length})` : f}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="rounded-2xl bg-paper p-8 text-center text-sm text-ink-soft ring-1 ring-line">
          Loading messages…
        </p>
      ) : visible.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl bg-paper px-8 py-14 text-center ring-1 ring-line">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-forest-50 text-forest-700">
            <IconMail className="h-6 w-6" />
          </span>
          <h3 className="font-display mt-4 text-lg font-medium text-forest-900">
            No messages here
          </h3>
          <p className="mt-1 max-w-sm text-sm leading-6 text-ink-soft">
            {filter === "all"
              ? "Nobody has written in yet — new contact-form messages appear here automatically."
              : "Nothing with this status right now."}
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {visible.map((m) => {
            const open = openId === m.id;
            return (
              <li
                key={m.id}
                className="overflow-hidden rounded-2xl bg-paper ring-1 ring-line"
              >
                <button
                  type="button"
                  onClick={() => {
                    setOpenId(open ? null : m.id);
                    if (!open && m.status === "new") void mark(m.id, "read");
                  }}
                  aria-expanded={open}
                  className="flex w-full flex-wrap items-center gap-3 px-5 py-4 text-left"
                >
                  <span
                    className={`rounded-full px-2.5 py-1 text-[0.65rem] font-bold uppercase tracking-wider ${STATUS_TONE[m.status]}`}
                  >
                    {m.status}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-ink">
                      {m.name} · {m.topic}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-ink-soft">
                      {m.message}
                    </span>
                  </span>
                  <span className="text-xs text-ink-soft">
                    {friendlyWhen(m.at)}
                  </span>
                </button>
                {open && (
                  <div className="border-t border-line px-5 py-4">
                    <p className="whitespace-pre-wrap text-sm leading-7 text-ink">
                      {m.message}
                    </p>
                    <div className="mt-4 flex flex-wrap items-center gap-3">
                      <a
                        href={`tel:${m.phone.replace(/\s/g, "")}`}
                        className="inline-flex items-center gap-1.5 rounded-full bg-forest-50 px-4 py-2 text-xs font-semibold text-forest-800 ring-1 ring-forest-100"
                      >
                        <IconPhone className="h-3.5 w-3.5" /> {m.phone}
                      </a>
                      {m.status !== "replied" && (
                        <button
                          type="button"
                          disabled={busy === m.id}
                          onClick={() => void mark(m.id, "replied")}
                          className="inline-flex items-center gap-1.5 rounded-full bg-forest-800 px-4 py-2 text-xs font-semibold text-ivory-50 hover:bg-forest-700 disabled:opacity-60"
                        >
                          <IconCheck className="h-3.5 w-3.5" />
                          {busy === m.id ? "Saving…" : "Mark replied"}
                        </button>
                      )}
                      {m.status === "replied" && (
                        <button
                          type="button"
                          disabled={busy === m.id}
                          onClick={() => void mark(m.id, "read")}
                          className="rounded-full px-4 py-2 text-xs font-semibold text-ink-soft ring-1 ring-line hover:text-forest-800 disabled:opacity-60"
                        >
                          Reopen
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
