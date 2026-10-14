"use client";

/**
 * One conversation (2026-10-11).
 *
 * Shared by the shopper's account tab and the shop's inbox — the only real
 * difference is which API it talks to and which side of the bubble it draws
 * itself on, so both are props rather than two near-identical components.
 *
 * It re-reads while it is open, on the same tick the tracker uses: a reply
 * that does not appear until the page is reloaded is a conversation that
 * feels broken.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useLiveRefresh } from "@/lib/use-live-refresh";
import type { ThreadMessage } from "@/lib/db/customer-threads";

const POLL_MS = 10_000;

export type MessageSide = "customer" | "shop" | "platform";

const SENDER_LABEL: Record<ThreadMessage["sender"], string> = {
  customer: "আপনি",
  shop: "দোকান",
  rider: "রাইডার",
  platform: "PROSANTI",
};

const clockTime = (ms: number, lang: "en" | "bn"): string =>
  new Date(ms).toLocaleTimeString(lang === "bn" ? "bn-BD" : "en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Dhaka",
  });

export default function MessageThread({
  threadId,
  basePath,
  self,
  lang = "bn",
  onClosed,
}: {
  threadId: string;
  /** "/api/account/threads" or "/api/vendor/threads". */
  basePath: string;
  /** Which sender is "me" — decides the bubble side and the label. */
  self: MessageSide;
  lang?: "en" | "bn";
  /** Called after this side closes the thread. */
  onClosed?: () => void;
}) {
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "unavailable" | "error">("loading");
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [closed, setClosed] = useState(false);
  const [notice, setNotice] = useState("");
  const bottom = useRef<HTMLDivElement | null>(null);

  const url = `${basePath}/${encodeURIComponent(threadId)}`;

  const load = useCallback(
    (silent: boolean) =>
      fetch(url, { cache: "no-store", credentials: "same-origin" })
        .then(async (res) => {
          if (res.status === 501) {
            setState("unavailable");
            return;
          }
          if (!res.ok) throw new Error(String(res.status));
          const data = (await res.json()) as { messages?: ThreadMessage[] };
          setMessages(data.messages ?? []);
          setState("ready");
        })
        .catch(() => {
          if (!silent) setState("error");
        }),
    [url],
  );

  useEffect(() => {
    void load(false);
  }, [load]);

  const poll = useCallback(() => {
    void load(true);
  }, [load]);
  // An open thread keeps listening; a closed one has nothing left to hear.
  useLiveRefresh(state === "ready" && !closed, POLL_MS, poll);

  useEffect(() => {
    // Optional call: not every environment has scrollIntoView, and losing the
    // auto-scroll is a small thing compared to losing the whole thread.
    bottom.current?.scrollIntoView?.({ block: "nearest" });
  }, [messages.length]);

  const send = async () => {
    const text = draft.trim();
    if (text === "" || busy) return;
    setBusy(true);
    setNotice("");
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ body: text }),
      });
      if (res.status === 501) {
        setState("unavailable");
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      setDraft("");
      await load(true);
    } catch {
      setNotice(lang === "bn" ? "বার্তা পাঠানো যায়নি — আবার চেষ্টা করুন।" : "Could not send — try again.");
    } finally {
      setBusy(false);
    }
  };

  const close = async () => {
    setBusy(true);
    try {
      await fetch(url, { method: "PATCH", credentials: "same-origin" });
      setClosed(true);
      onClosed?.();
    } finally {
      setBusy(false);
    }
  };

  if (state === "loading") {
    return (
      <p role="status" className="py-6 text-sm text-ink-soft">
        {lang === "bn" ? "বার্তা লোড হচ্ছে…" : "Loading messages…"}
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
  if (state === "unavailable") {
    return (
      <p className="py-6 text-sm text-ink-soft" data-testid="messages-unavailable">
        {lang === "bn"
          ? "মেসেজের টেবিলটি এখনো তৈরি হয়নি — Supabase-এ 202610110002_customer_threads.sql চালান।"
          : "The message tables are not set up yet — run 202610110002_customer_threads.sql in Supabase."}
      </p>
    );
  }

  return (
    <div className="space-y-4" data-testid="message-thread">
      <ul className="space-y-2.5">
        {messages.map((m) => {
          const mine = m.sender === self;
          return (
            <li key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${
                  mine ? "bg-forest-800 text-ivory-50" : "bg-ivory-100 text-ink ring-1 ring-line"
                }`}
              >
                <p className="whitespace-pre-wrap break-words text-sm leading-6">{m.body}</p>
                <p
                  className={`mt-1 text-[10px] ${mine ? "text-ivory-200" : "text-ink-soft"}`}
                >
                  {mine ? "" : `${m.senderName || SENDER_LABEL[m.sender]} · `}
                  {clockTime(m.at, lang)}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
      <div ref={bottom} />

      {closed ? (
        <p className="text-xs text-ink-soft">
          {lang === "bn" ? "এই কথোপকথন বন্ধ করা হয়েছে।" : "This thread is closed."}
        </p>
      ) : (
        <div className="flex flex-wrap items-end gap-2">
          <label className="min-w-0 flex-1">
            <span className="sr-only">
              {lang === "bn" ? "বার্তা লিখুন" : "Write a message"}
            </span>
            <textarea
              value={draft}
              maxLength={2000}
              rows={2}
              disabled={busy}
              onChange={(e) => setDraft(e.target.value)}
              className="w-full rounded-xl border border-line bg-ivory-50 px-3 py-2 text-sm"
              placeholder={
                lang === "bn" ? "আপনার বার্তা লিখুন…" : "Write your message…"
              }
            />
          </label>
          <button
            type="button"
            disabled={busy || draft.trim() === ""}
            onClick={() => void send()}
            className="min-h-11 rounded-full bg-forest-800 px-5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy ? "…" : lang === "bn" ? "পাঠান" : "Send"}
          </button>
          {self !== "customer" ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void close()}
              className="min-h-11 text-xs font-semibold text-ink-soft underline underline-offset-2 disabled:opacity-50"
            >
              {lang === "bn" ? "বন্ধ করুন" : "Close thread"}
            </button>
          ) : null}
        </div>
      )}
      {notice ? (
        <p role="alert" className="text-xs text-rose-800">
          {notice}
        </p>
      ) : null}
    </div>
  );
}
