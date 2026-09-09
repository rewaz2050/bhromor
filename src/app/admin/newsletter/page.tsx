"use client";

import { useMemo, useState } from "react";
import { useNewsletterAdmin } from "@/lib/use-newsletter-admin";
import { subscribersToCsv } from "@/lib/engagement";
import { friendlyWhen } from "@/components/admin/order-ui";
import { useTransientValue } from "@/lib/use-transient-value";
import {
  IconCheck,
  IconCopy,
  IconSend,
  IconTrash,
} from "@/components/ui/icons";

/** Staff newsletter list — table-based signups from the footer form. */
export default function AdminNewsletterPage() {
  const { subscribers, remove, live, loading, error } = useNewsletterAdmin();
  const [query, setQuery] = useState("");
  const [copied, setCopied] = useTransientValue<string | null>(null, 1400);
  const [busy, setBusy] = useState<string | null>(null);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return subscribers
      .filter((s) => q === "" || s.email.toLowerCase().includes(q))
      .sort((a, b) => b.at - a.at);
  }, [subscribers, query]);
  const active = useMemo(
    () => subscribers.filter((s) => s.status === "subscribed").length,
    [subscribers],
  );

  const copyUnsub = async (token: string) => {
    const link = `${window.location.origin}/api/newsletter/unsubscribe?token=${token}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(token);
    } catch {
      window.prompt("Copy the unsubscribe link:", link);
    }
  };

  const exportCsv = () => {
    const blob = new Blob(
      [subscribersToCsv(subscribers.filter((s) => s.status === "subscribed"))],
      { type: "text/csv" },
    );
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "prosanti-newsletter.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const drop = async (id: string, email: string) => {
    if (
      !window.confirm(`Remove ${email} from the list? This cannot be undone.`)
    ) {
      return;
    }
    setBusy(id);
    await remove(id);
    setBusy(null);
  };

  if (!live && !loading) {
    return (
      <div className="flex max-w-xl flex-col items-start rounded-2xl bg-paper p-8 ring-1 ring-line">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-forest-50 text-forest-700">
          <IconSend className="h-5 w-5" />
        </span>
        <h2 className="font-display mt-4 text-lg font-medium text-forest-900">
          Newsletter lives in the database
        </h2>
        <p className="mt-2 text-sm leading-6 text-ink-soft">
          Subscriber emails are real customer data, so there is no demo list.
          Connect Supabase and sign in as staff to see signups here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-medium text-forest-900">
            Newsletter
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            {active} subscribed · signups arrive from the footer form.
          </p>
        </div>
        <button
          type="button"
          onClick={exportCsv}
          disabled={active === 0}
          className="rounded-full bg-forest-800 px-5 py-2.5 text-sm font-semibold text-ivory-50 transition-colors hover:bg-forest-700 disabled:opacity-50"
        >
          Export CSV
        </button>
      </div>

      {error && (
        <p role="alert" className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-rose-200">
          {error}
        </p>
      )}

      <div className="relative max-w-sm">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search emails…"
          className="h-11 w-full rounded-full bg-paper pl-4 pr-4 text-sm ring-1 ring-line placeholder:text-ink-soft/60 focus:ring-2 focus:ring-forest-500"
        />
      </div>

      {loading ? (
        <p className="rounded-2xl bg-paper p-8 text-center text-sm text-ink-soft ring-1 ring-line">
          Loading subscribers…
        </p>
      ) : visible.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl bg-paper px-8 py-14 text-center ring-1 ring-line">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-forest-50 text-forest-700">
            <IconSend className="h-6 w-6" />
          </span>
          <h3 className="font-display mt-4 text-lg font-medium text-forest-900">
            No signups yet
          </h3>
          <p className="mt-1 max-w-sm text-sm leading-6 text-ink-soft">
            Footer signups appear here automatically — share the store to grow
            the list.
          </p>
        </div>
      ) : (
        <ul className="overflow-hidden rounded-2xl bg-paper ring-1 ring-line">
          {visible.map((s) => (
            <li
              key={s.id}
              className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3.5 last:border-0"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-ink">
                  {s.email}
                </span>
                <span className="mt-0.5 block text-xs text-ink-soft">
                  {s.status === "subscribed" ? "Subscribed" : "Unsubscribed"} ·{" "}
                  {friendlyWhen(s.at)}
                </span>
              </span>
              {s.status === "subscribed" && (
                <button
                  type="button"
                  onClick={() => void copyUnsub(s.token)}
                  title="Copy unsubscribe link"
                  className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold text-ink-soft ring-1 ring-line hover:text-forest-800"
                >
                  {copied === s.token ? (
                    <IconCheck className="h-3.5 w-3.5" />
                  ) : (
                    <IconCopy className="h-3.5 w-3.5" />
                  )}
                  {copied === s.token ? "Copied" : "Unsub link"}
                </button>
              )}
              <button
                type="button"
                disabled={busy === s.id}
                onClick={() => void drop(s.id, s.email)}
                title="Remove subscriber"
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold text-rose-700 ring-1 ring-rose-200 hover:bg-rose-50 disabled:opacity-60"
              >
                <IconTrash className="h-3.5 w-3.5" />
                {busy === s.id ? "…" : "Remove"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
