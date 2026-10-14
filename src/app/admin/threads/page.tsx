"use client";

/**
 * Shopper ↔ shop conversations, for staff (2026-10-13).
 *
 * The two routes under /api/admin/threads have existed since the messaging
 * pass with nothing calling them: a shop that stopped answering left its
 * customer standing there with a question and no way to reach the platform
 * about it. This page is that way.
 *
 * Any staff account can read and answer, exactly like the contact inbox
 * beside it — these are ordinary conversations, not money, and the routes are
 * gated the same way. Staff answer as "platform", so the shopper can see who
 * is speaking rather than wondering why the shop changed its voice.
 */

import { useCallback, useEffect, useState } from "react";

import MessageThread from "@/components/messages/message-thread";
import { IconChat } from "@/components/ui/icons";
import { formatDateTime } from "@/components/vendor/vendor-ui";
import { useLiveRefresh } from "@/lib/use-live-refresh";
import type { ThreadSummary } from "@/lib/db/customer-threads";

const FILTERS = ["open", "closed", "all"] as const;
type Filter = (typeof FILTERS)[number];

/** An oversight inbox is worth refreshing on its own. */
const THREADS_REFRESH_MS = 30_000;

const when = (ms: number): string => formatDateTime(ms);

export default function AdminThreadsPage() {
  const [threads, setThreads] = useState<ThreadSummary[] | null>(null);
  const [filter, setFilter] = useState<Filter>("open");
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    (silent: boolean) => {
      const query = filter === "all" ? "" : `?status=${filter}`;
      return fetch(`/api/admin/threads${query}`, { cache: "no-store" })
        .then(async (res) => {
          if (res.status === 501) {
            setError("202610110002_customer_threads.sql has not been run yet.");
            setThreads([]);
            return;
          }
          if (!res.ok) throw new Error(String(res.status));
          const data = (await res.json()) as {
            threads?: ThreadSummary[];
            reason?: string | null;
          };
          setThreads(data.threads ?? []);
          setError(null);
        })
        .catch(() => {
          // A failed background read is not news; a failed first read is.
          if (!silent) setError("Could not load the threads.");
        });
    },
    [filter],
  );

  useEffect(() => {
    void load(false);
  }, [load]);

  const refreshSilently = useCallback(() => {
    void load(true);
  }, [load]);
  useLiveRefresh(true, THREADS_REFRESH_MS, refreshSilently);

  const rows = threads ?? [];
  const awaiting = rows.filter(
    (t) => t.status === "open" && t.lastSender === "customer",
  ).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl text-forest-900">Shopper threads</h1>
          <p className="mt-1 text-sm text-ink-soft">
            Every conversation between a shopper and a shop. Answer as the
            platform when a shop has gone quiet — the shopper sees who is
            speaking.
          </p>
        </div>
        {awaiting > 0 && (
          <p
            data-testid="threads-awaiting"
            className="rounded-full bg-amber-100 px-3 py-1.5 text-xs font-semibold text-amber-900"
          >
            {awaiting} awaiting a reply
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            // The open thread belongs to the list it was picked from, so
            // switching lists drops it here rather than in an effect.
            onClick={() => {
              setFilter(f);
              setSelected(null);
            }}
            className={`rounded-full px-3.5 py-1.5 text-xs font-semibold capitalize ${
              filter === f
                ? "bg-forest-800 text-white"
                : "bg-paper text-ink-soft ring-1 ring-line hover:bg-cream"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {error ? (
        <p
          role="alert"
          data-testid="threads-error"
          className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200"
        >
          {error}
        </p>
      ) : null}

      {threads === null && !error ? (
        <div className="space-y-2" aria-label="Loading">
          <div className="h-16 animate-pulse rounded-2xl bg-line/60" />
          <div className="h-16 animate-pulse rounded-2xl bg-line/60" />
        </div>
      ) : rows.length === 0 ? (
        <p
          data-testid="threads-empty"
          className="rounded-2xl bg-paper px-4 py-8 text-center text-sm text-ink-soft ring-1 ring-line"
        >
          No {filter === "all" ? "" : `${filter} `}conversations yet.
        </p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
          <ul className="space-y-2" data-testid="threads-list">
            {rows.map((t) => {
              const waiting = t.status === "open" && t.lastSender === "customer";
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(t.id)}
                    className={`w-full rounded-2xl px-4 py-3 text-left ring-1 ${
                      selected === t.id
                        ? "bg-forest-50 ring-forest-300"
                        : "bg-paper ring-line hover:bg-cream"
                    }`}
                  >
                    <p className="flex items-center gap-2 text-sm font-semibold text-forest-900">
                      <IconChat className="h-3.5 w-3.5 shrink-0" />
                      {t.orderNo ? `#${t.orderNo}` : "General question"}
                      {waiting ? (
                        <span className="ml-auto rounded-full bg-amber-200 px-2 py-0.5 text-[10px] font-bold text-amber-900">
                          needs reply
                        </span>
                      ) : null}
                    </p>
                    <p className="mt-1 truncate text-xs text-ink-soft">
                      {t.shopName ?? "Platform"} · {t.lastBody || "(no text)"}
                    </p>
                    <p className="mt-0.5 text-[11px] text-ink-soft">
                      {when(t.lastMessageAt)}
                    </p>
                  </button>
                </li>
              );
            })}
          </ul>

          {selected ? (
            <div className="rounded-2xl bg-paper p-4 ring-1 ring-line">
              <MessageThread
                threadId={selected}
                basePath="/api/admin/threads"
                self="platform"
                lang="en"
              />
            </div>
          ) : (
            <p className="rounded-2xl bg-paper px-4 py-8 text-center text-sm text-ink-soft ring-1 ring-line">
              Pick a conversation to read it and answer.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
