"use client";

/**
 * The thread list, and the conversation it opens (2026-10-11).
 *
 * One component, two homes: the shopper's account tab and the shop's inbox.
 * Which side you are decides the API, the labels and whether a "close" button
 * exists at all — a shopper cannot close a shop's thread and a shop cannot
 * close the platform's oversight copy.
 */

import { useCallback, useEffect, useState } from "react";
import { useLiveRefresh } from "@/lib/use-live-refresh";
import type { ThreadSummary } from "@/lib/db/customer-threads";
import MessageThread, { type MessageSide } from "./message-thread";

const POLL_MS = 15_000;

const whenShort = (ms: number, lang: "en" | "bn"): string =>
  new Date(ms).toLocaleString(lang === "bn" ? "bn-BD" : "en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Dhaka",
  });

export default function MessageInbox({
  basePath,
  self,
  lang = "bn",
  emptyHint,
}: {
  basePath: string;
  self: MessageSide;
  lang?: "en" | "bn";
  /** What an empty inbox says — the two sides have different advice. */
  emptyHint: string;
}) {
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "unavailable" | "error">("loading");
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(
    (silent: boolean) =>
      fetch(basePath, { cache: "no-store", credentials: "same-origin" })
        .then(async (res) => {
          if (res.status === 501) {
            setState("unavailable");
            return;
          }
          if (!res.ok) throw new Error(String(res.status));
          const data = (await res.json()) as { threads?: ThreadSummary[] };
          setThreads(data.threads ?? []);
          setState("ready");
        })
        .catch(() => {
          if (!silent) setState("error");
        }),
    [basePath],
  );

  useEffect(() => {
    void load(false);
  }, [load]);

  const poll = useCallback(() => {
    void load(true);
  }, [load]);
  // Somebody may answer while this is sitting open — that is the whole point.
  useLiveRefresh(state === "ready", POLL_MS, poll);

  if (state === "loading") {
    return (
      <p role="status" className="py-6 text-sm text-ink-soft">
        {lang === "bn" ? "বার্তা লোড হচ্ছে…" : "Loading messages…"}
      </p>
    );
  }
  if (state === "unavailable") {
    return (
      <p className="py-6 text-sm text-ink-soft" data-testid="messages-unavailable">
        {lang === "bn"
          ? "মেসেজের টেবিলটি এখনো তৈরি হয়নি — Supabase-এ 202610110002_customer_threads.sql চালান।"
          : "The message tables are not set up yet — run 202610110002_customer_threads.sql in Supabase."}
      </p>
    );
  }
  if (state === "error") {
    return (
      <p role="alert" className="py-6 text-sm text-rose-800">
        {lang === "bn" ? "বার্তা লোড করা যায়নি।" : "Could not load the messages."}{" "}
        <button type="button" className="underline underline-offset-2" onClick={() => void load(false)}>
          ↻
        </button>
      </p>
    );
  }

  if (openId) {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => {
            setOpenId(null);
            void load(true);
          }}
          className="text-xs font-semibold text-forest-800 underline underline-offset-2"
        >
          ← {lang === "bn" ? "সব বার্তা" : "All messages"}
        </button>
        <MessageThread
          threadId={openId}
          basePath={basePath}
          self={self}
          lang={lang}
          onClosed={() => void load(true)}
        />
      </div>
    );
  }

  if (threads.length === 0) {
    return (
      <p className="py-6 text-sm text-ink-soft" data-testid="messages-empty">
        {emptyHint}
      </p>
    );
  }

  return (
    <ul className="divide-y divide-line" data-testid="message-inbox">
      {threads.map((t) => (
        <li key={t.id}>
          <button
            type="button"
            onClick={() => setOpenId(t.id)}
            className="flex w-full items-start gap-3 py-4 text-left"
          >
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2">
                <span className="truncate text-sm font-semibold text-forest-900">
                  {t.shopName ?? (lang === "bn" ? "PROSANTI" : "PROSANTI")}
                </span>
                {t.orderNo ? (
                  <span className="font-mono text-xs text-ink-soft">{t.orderNo}</span>
                ) : null}
                {t.unread > 0 ? (
                  <span
                    data-testid="thread-unread"
                    className="rounded-full bg-gold-500 px-2 py-0.5 text-[10px] font-bold text-white"
                  >
                    {t.unread}
                  </span>
                ) : null}
                {t.status === "closed" ? (
                  <span className="rounded-full bg-ivory-200 px-2 py-0.5 text-[10px] font-semibold text-ink-soft">
                    {lang === "bn" ? "বন্ধ" : "Closed"}
                  </span>
                ) : null}
              </p>
              <p className="mt-1 truncate text-sm text-ink-soft">{t.lastBody}</p>
              <p className="mt-0.5 text-[11px] text-ink-soft">{whenShort(t.lastMessageAt, lang)}</p>
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}
