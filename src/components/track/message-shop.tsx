"use client";

/**
 * "Message the shop" on the tracker (2026-10-11).
 *
 * The WhatsApp button stays — it is the fastest route for someone who has it —
 * but it leaves the site and keeps nothing. This writes into the order's own
 * thread, where the shop can answer and both sides can read it later.
 *
 * A thread belongs to an account, so a guest is sent to sign in with the
 * tracker as the way back, rather than being shown a composer that cannot
 * work. The order number goes up with the message; the shop is resolved from
 * the order server-side, never from here.
 */

import { useState } from "react";
import { useCustomer } from "@/lib/use-customer";
import { useLanguage } from "@/components/i18n/language-provider";
import { IconChat } from "@/components/ui/icons";
import MessageThread from "@/components/messages/message-thread";
import type { Order } from "@/lib/orders";

export default function MessageShop({ order }: { order: Order }) {
  const { t, lang } = useLanguage();
  const { customer } = useCustomer();
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const signInHref = `/account?next=${encodeURIComponent(
    typeof window === "undefined" ? "/track" : `${window.location.pathname}${window.location.search}`,
  )}`;

  const start = async () => {
    const text = draft.trim();
    if (text === "" || busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/account/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ orderNo: order.id, body: text }),
      });
      const data = (await res.json().catch(() => null)) as { threadId?: string } | null;
      if (res.status === 501) {
        setError(
          lang === "bn"
            ? "মেসেজের টেবিলটি এখনো তৈরি হয়নি — এখন WhatsApp-ই ব্যবহার করুন।"
            : "Messaging is not set up yet — use WhatsApp for now.",
        );
        return;
      }
      if (!res.ok || !data?.threadId) throw new Error(String(res.status));
      setDraft("");
      setThreadId(data.threadId);
    } catch {
      setError(lang === "bn" ? "বার্তা পাঠানো যায়নি — আবার চেষ্টা করুন।" : "Could not send — try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      className="rounded-3xl bg-paper p-5 ring-1 ring-line sm:p-6"
      data-testid="message-shop"
    >
      <p className="flex items-center gap-2 font-display text-lg text-forest-900">
        <IconChat className="h-4 w-4" />
        {t("track.messageShopTitle")}
      </p>
      <p className="mt-1 text-sm leading-6 text-ink-soft">{t("track.messageShopBody")}</p>

      {!customer ? (
        <a
          href={signInHref}
          className="mt-4 inline-flex min-h-11 items-center rounded-full bg-forest-800 px-5 text-xs font-semibold text-ivory-50 transition-colors hover:bg-forest-700"
        >
          {t("track.messageShopSignIn")}
        </a>
      ) : threadId ? (
        <div className="mt-4">
          <MessageThread threadId={threadId} basePath="/api/account/threads" self="customer" lang={lang} />
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          <label className="block">
            <span className="sr-only">{t("track.messageShopPlaceholder")}</span>
            <textarea
              value={draft}
              rows={3}
              maxLength={2000}
              disabled={busy}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={t("track.messageShopPlaceholder")}
              className="w-full rounded-xl border border-line bg-ivory-50 px-3 py-2 text-sm"
            />
          </label>
          <button
            type="button"
            disabled={busy || draft.trim() === ""}
            onClick={() => void start()}
            className="min-h-11 rounded-full bg-forest-800 px-5 text-xs font-semibold text-ivory-50 transition-colors hover:bg-forest-700 disabled:opacity-50"
          >
            {busy ? "…" : t("track.messageShopSend")}
          </button>
        </div>
      )}
      {error ? (
        <p role="alert" className="mt-2 text-xs text-rose-800">
          {error}
        </p>
      ) : null}
    </section>
  );
}
