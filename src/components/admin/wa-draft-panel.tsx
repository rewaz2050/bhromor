"use client";

/**
 * WhatsApp drafts, ready to send (2026-09-24).
 *
 * The free half of the customer-notification layer. Push tells the shopper
 * automatically on every order step; when it reached nobody (no opt-in, dead
 * device) the same message lands here as a draft, and one tap opens the shop's
 * own WhatsApp Business app with the text already written. No Meta account, no
 * template approval, no per-message fee — see `wa-outbox.ts` for the why.
 *
 * Two mounts, one component:
 *   • `mode="order"` — the order page, right under the status actions, so the
 *     draft appears the moment the step is advanced;
 *   • `mode="queue"` — a thin strip on the orders list, so staff know drafts
 *     are waiting without opening twenty orders.
 *
 * What the panel refuses to do: call a draft "sent". Tapping the link opens
 * WhatsApp; what happens inside that app is invisible to the browser, so the
 * row records the OPEN and the footnote says so.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiErrorMessage, apiGet, apiSend } from "@/lib/admin-api";
import { IconChat } from "@/components/ui/icons";

interface Draft {
  id: string;
  orderNo: string;
  kind: string;
  lang: string;
  message: string;
  createdAt: string;
  label: string;
  link: string | null;
}

interface Payload {
  ready: boolean;
  migration?: string;
  drafts: Draft[];
}

export default function WaDraftPanel({
  orderNo,
  status,
  mode = "order",
}: {
  /** Scope to one order (order mode). Omit for the shop-wide queue. */
  orderNo?: string;
  /** Re-read when the order moves to the next step (order mode). */
  status?: string;
  mode?: "order" | "queue";
}) {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [ready, setReady] = useState(true);
  const [migration, setMigration] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const path = useMemo(() => {
    const params = new URLSearchParams();
    if (orderNo) params.set("order", orderNo);
    params.set("limit", mode === "queue" ? "5" : "20");
    return `/api/admin/wa-outbox?${params.toString()}`;
  }, [orderNo, mode]);

  const refresh = useCallback(async () => {
    try {
      const data = await apiGet<Payload>(path);
      setDrafts(data.drafts ?? []);
      setReady(data.ready !== false);
      setMigration(data.migration ?? null);
      setError(null);
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }, [path]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the queue is re-read when the order moves to its next step (same pattern as the warranty card)
    void refresh();
  }, [refresh, status]);

  const close = async (draft: Draft, action: "opened" | "dismissed") => {
    setBusyId(draft.id);
    // Optimistic: the tap already did the real thing (WhatsApp opened, or the
    // staff decided against it). A failed write brings the row back on refresh.
    setDrafts((current) => current.filter((d) => d.id !== draft.id));
    try {
      await apiSend("/api/admin/wa-outbox", "POST", { id: draft.id, action });
    } catch (err) {
      setError(apiErrorMessage(err));
      await refresh();
    } finally {
      setBusyId(null);
    }
  };

  if (!ready) {
    return (
      <div
        data-testid="wa-draft-missing"
        className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-900"
      >
        <p className="font-semibold">WhatsApp drafts are off — the table is missing.</p>
        <p className="mt-1">
          Run <code className="font-mono">{migration ?? "202609240003_wa_outbox.sql"}</code> in
          the Supabase SQL Editor. Until then a shopper with no notifications simply
          gets nothing automatic — the shop still calls or messages by hand.
        </p>
      </div>
    );
  }

  if (error && drafts.length === 0) {
    return (
      <p data-testid="wa-draft-error" className="text-xs text-rose-800">
        {error}
      </p>
    );
  }

  // Nothing waiting: stay out of the way in both mounts.
  if (drafts.length === 0) return null;

  if (mode === "queue") {
    return (
      <div
        data-testid="wa-draft-queue"
        className="rounded-2xl border border-[#25D366]/40 bg-[#25D366]/8 p-4"
      >
        <p className="text-sm font-semibold text-forest-900">
          <span data-testid="wa-draft-count">{drafts.length}</span> WhatsApp message
          {drafts.length === 1 ? "" : "s"} ready to send
        </p>
        <p className="mt-0.5 text-[0.7rem] text-ink-soft">
          The shopper never turned on phone notifications, so the step is waiting here
          as a draft — one tap, no API cost.
        </p>
        <ul className="mt-2 space-y-1.5">
          {drafts.map((draft) => (
            <li key={draft.id} className="flex items-center gap-2 text-xs">
              <span className="rounded-full bg-ivory-100 px-2 py-0.5 font-medium text-ink-soft">
                {draft.label}
              </span>
              <Link
                href={`/admin/orders/${encodeURIComponent(draft.orderNo)}`}
                className="font-mono font-semibold text-forest-800 underline decoration-dotted"
              >
                {draft.orderNo}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <section
      data-testid="wa-draft-panel"
      className="rounded-2xl border border-[#25D366]/40 bg-[#25D366]/8 p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-forest-900">
          WhatsApp message ready —{" "}
          <span data-testid="wa-draft-count">{drafts.length}</span>
        </p>
        <span className="text-[0.68rem] text-ink-soft">
          This shopper has no phone notifications on
        </span>
      </div>

      <ul className="mt-3 space-y-3">
        {drafts.map((draft) => (
          <li
            key={draft.id}
            data-testid="wa-draft"
            className="rounded-xl bg-paper p-3 ring-1 ring-line"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="rounded-full bg-ivory-100 px-2.5 py-0.5 text-[0.68rem] font-semibold text-ink-soft">
                {draft.label}
              </span>
              <span className="text-[0.65rem] text-ink-soft">
                {new Date(draft.createdAt).toLocaleString("en-GB", {
                  day: "2-digit",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>
            <p className="mt-2 whitespace-pre-line text-xs leading-5 text-ink">
              {draft.message}
            </p>
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <a
                data-testid="wa-draft-open"
                href={draft.link ?? "#"}
                target="_blank"
                rel="noopener noreferrer"
                aria-disabled={draft.link ? undefined : true}
                onClick={(e) => {
                  if (!draft.link) {
                    e.preventDefault();
                    return;
                  }
                  void close(draft, "opened");
                }}
                className={`inline-flex items-center gap-1.5 rounded-full bg-[#25D366] px-3.5 py-2 text-xs font-semibold text-white hover:brightness-95 ${
                  draft.link ? "" : "pointer-events-none opacity-40"
                }`}
              >
                <IconChat className="h-3.5 w-3.5" />
                Open in WhatsApp
              </a>
              <button
                type="button"
                data-testid="wa-draft-dismiss"
                disabled={busyId === draft.id}
                onClick={() => void close(draft, "dismissed")}
                className="rounded-full px-3 py-2 text-xs font-medium text-ink-soft ring-1 ring-line hover:text-forest-800"
              >
                Not needed
              </button>
            </div>
          </li>
        ))}
      </ul>

      <p className="mt-3 text-[0.68rem] leading-4 text-ink-soft">
        Tap <strong>Open in WhatsApp</strong>, then press send there — the app opens with
        the text written, it does not send by itself. This row records that you opened
        it, never that WhatsApp delivered it.
      </p>
      {error && (
        <p data-testid="wa-draft-error" className="mt-2 text-xs text-rose-800">
          {error}
        </p>
      )}
    </section>
  );
}
