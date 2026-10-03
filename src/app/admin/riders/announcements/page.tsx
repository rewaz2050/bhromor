"use client";

/**
 * Admin → Riders → Announcements (202610020001): write to every rider's app
 * inbox, or to one rider. Messages can expire on their own.
 */

import Link from "next/link";
import { useState } from "react";
import { useNow } from "@/lib/use-now";
import { useRiderAnnouncements } from "@/lib/use-rider-announcements";
import type { AnnouncementSeverity } from "@/lib/rider-inbox";

const fmtWhen = (ts: number): string =>
  new Date(ts).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default function RiderAnnouncementsPage() {
  const { live, checked, items, riders, ready, loading, error, post, remove } = useRiderAnnouncements();
  const now = useNow(60_000);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [severity, setSeverity] = useState<AnnouncementSeverity>("info");
  const [riderId, setRiderId] = useState("");
  const [expires, setExpires] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setSent(false);
    const ok = await post({
      title: title.trim(),
      body: body.trim(),
      severity,
      riderId: riderId || null,
      expiresHours: expires ? Number(expires) : null,
    });
    setBusy(false);
    if (ok) {
      setSent(true);
      setTitle("");
      setBody("");
      setSeverity("info");
      setRiderId("");
      setExpires("");
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-4 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl text-forest-900">Rider announcements</h1>
          <p className="mt-1 text-sm text-ink-soft">রাইডারদের অ্যাপের “বার্তা” ট্যাবে নোটিশ পাঠান — সবাইকে বা একজনকে।</p>
        </div>
        <Link href="/admin/riders" className="text-sm font-semibold text-forest-800 underline underline-offset-2">
          ← Riders
        </Link>
      </header>

      {checked && !live && (
        <p className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-200">Staff হিসেবে sign in করুন।</p>
      )}

      {live && !ready && (
        <p data-testid="announcements-missing" className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-200">
          Rider inbox এখনো চালু হয়নি। Supabase SQL Editor-এ <code>supabase/migrations/202610020001_rider_inbox.sql</code> চালান।
        </p>
      )}

      {error && (
        <p role="alert" className="rounded-2xl bg-rose-50 p-4 text-sm text-rose-900 ring-1 ring-rose-200">
          {error}
        </p>
      )}

      {live && ready && (
        <form onSubmit={submit} className="space-y-3 rounded-2xl bg-paper p-5 ring-1 ring-line" data-testid="announcement-form">
          <label className="block text-xs font-semibold uppercase tracking-wider text-ink-soft">
            শিরোনাম
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={120}
              required
              className="mt-1 w-full rounded-xl bg-ivory-100 px-3 py-2 text-sm normal-case text-ink ring-1 ring-line"
            />
          </label>
          <label className="block text-xs font-semibold uppercase tracking-wider text-ink-soft">
            বার্তা
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={1000}
              rows={3}
              className="mt-1 w-full rounded-xl bg-ivory-100 px-3 py-2 text-sm normal-case text-ink ring-1 ring-line"
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block text-xs font-semibold uppercase tracking-wider text-ink-soft">
              কাকে
              <select
                value={riderId}
                onChange={(e) => setRiderId(e.target.value)}
                aria-label="Recipient"
                className="mt-1 w-full rounded-xl bg-ivory-100 px-3 py-2 text-sm normal-case text-ink ring-1 ring-line"
              >
                <option value="">সব রাইডার</option>
                {riders.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-semibold uppercase tracking-wider text-ink-soft">
              গুরুত্ব
              <select
                value={severity}
                onChange={(e) => setSeverity(e.target.value as AnnouncementSeverity)}
                aria-label="Severity"
                className="mt-1 w-full rounded-xl bg-ivory-100 px-3 py-2 text-sm normal-case text-ink ring-1 ring-line"
              >
                <option value="info">সাধারণ</option>
                <option value="important">জরুরি</option>
              </select>
            </label>
            <label className="block text-xs font-semibold uppercase tracking-wider text-ink-soft">
              মেয়াদ
              <select
                value={expires}
                onChange={(e) => setExpires(e.target.value)}
                aria-label="Expiry"
                className="mt-1 w-full rounded-xl bg-ivory-100 px-3 py-2 text-sm normal-case text-ink ring-1 ring-line"
              >
                <option value="">মেয়াদ নেই</option>
                <option value="24">২৪ ঘণ্টা</option>
                <option value="72">৩ দিন</option>
                <option value="168">৭ দিন</option>
              </select>
            </label>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={busy || title.trim().length === 0}
              className="rounded-full bg-forest-800 px-5 py-2 text-sm font-semibold text-ivory-50 disabled:opacity-50"
            >
              {busy ? "পাঠানো হচ্ছে…" : "পাঠান"}
            </button>
            {sent && (
              <span role="status" className="text-xs font-semibold text-emerald-800">
                ✓ পাঠানো হয়েছে
              </span>
            )}
          </div>
        </form>
      )}

      {live && ready && (
        <section aria-label="Sent announcements" className="rounded-2xl bg-paper ring-1 ring-line">
          <h2 className="px-5 pt-5 font-display text-lg font-bold text-forest-900">পাঠানো বার্তা</h2>
          {items.length === 0 ? (
            <p className="px-5 py-4 text-sm text-ink-soft">{loading ? "Loading…" : "এখনো কোনো বার্তা পাঠানো হয়নি।"}</p>
          ) : (
            <ul className="mt-2 divide-y divide-line">
              {items.map((a) => (
                <li key={a.id} data-testid="announcement-row" className="flex items-start justify-between gap-3 px-5 py-3 text-sm">
                  <div className="min-w-0">
                    <p className="font-semibold text-forest-900">
                      {a.severity === "important" ? "❗ " : ""}
                      {a.title}
                    </p>
                    {a.body && <p className="mt-0.5 whitespace-pre-line text-xs text-ink">{a.body}</p>}
                    <p className="mt-1 text-[11px] text-ink-soft">
                      {a.riderId ? `→ ${a.riderName ?? "একজন রাইডার"}` : "→ সব রাইডার"} · {fmtWhen(a.at)}
                      {a.expiresAt ? ` · মেয়াদ ${fmtWhen(a.expiresAt)}${a.expiresAt < now ? " (শেষ)" : ""}` : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm("বার্তাটি সব রাইডারের ইনবক্স থেকে মুছে যাবে। নিশ্চিত?")) void remove(a.id);
                    }}
                    className="shrink-0 rounded-full bg-rose-50 px-3 py-1 text-[11px] font-semibold text-rose-800 ring-1 ring-rose-200"
                  >
                    মুছুন
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
