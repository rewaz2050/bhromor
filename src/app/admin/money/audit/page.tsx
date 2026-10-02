"use client";

/**
 * Admin → Money → Audit trail (202610010006, audit item T): who approved what
 * money movement, newest first. Written by database triggers; read-only here.
 */

import Link from "next/link";
import { formatBdt } from "@/lib/format";
import { AUDIT_EVENTS, AUDIT_EVENT_LABEL, describeAudit, type AuditEvent } from "@/lib/money-audit";
import { useMoneyAudit } from "@/lib/use-money-audit";

const fmtWhen = (ts: number): string =>
  ts > 0
    ? new Date(ts).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : "—";

export default function MoneyAuditPage() {
  const { live, checked, event, setEvent, entries, ready, loading, error, refresh } = useMoneyAudit();

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl text-forest-900">Money audit trail</h1>
          <p className="mt-1 text-sm text-ink-soft">
            কে, কখন, কোন টাকার approval দিয়েছে। Database নিজে লেখে — মোছা বা বদলানো যায় না।
          </p>
        </div>
        <Link href="/admin/money" className="text-sm font-semibold text-forest-800 underline underline-offset-2">
          ← Money
        </Link>
      </header>

      {checked && !live && (
        <p className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-200">
          Staff হিসেবে sign in করুন।
        </p>
      )}

      {live && (
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-xs font-semibold uppercase tracking-wider text-ink-soft" htmlFor="audit-event">
            Event
          </label>
          <select
            id="audit-event"
            data-testid="audit-filter"
            value={event}
            onChange={(e) => setEvent(e.target.value as AuditEvent | "all")}
            className="rounded-xl bg-paper px-3 py-2 text-sm ring-1 ring-line"
          >
            <option value="all">All events</option>
            {AUDIT_EVENTS.map((e) => (
              <option key={e} value={e}>
                {AUDIT_EVENT_LABEL[e]}
              </option>
            ))}
          </select>
          <Link
            href="/admin/money/export?kind=audit"
            data-testid="audit-export"
            className="rounded-full bg-paper px-3 py-1.5 text-xs font-semibold ring-1 ring-line hover:bg-ivory-100"
          >
            CSV হিসেবে নামান
          </Link>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading}
            className="rounded-full bg-paper px-3 py-1.5 text-xs font-semibold ring-1 ring-line hover:bg-ivory-100 disabled:opacity-50"
          >
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>
      )}

      {error && (
        <p role="alert" className="rounded-2xl bg-rose-50 p-4 text-sm text-rose-900 ring-1 ring-rose-200">
          {error}
        </p>
      )}

      {live && !ready && (
        <p data-testid="audit-missing" className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-200">
          Audit trail এখনো চালু হয়নি। Supabase SQL Editor-এ <code>supabase/migrations/202610010006_money_audit.sql</code> চালান।
        </p>
      )}

      {live && ready && entries.length === 0 && !loading && (
        <p className="rounded-2xl bg-paper p-6 text-center text-sm text-ink-soft ring-1 ring-line">
          এখনো কোনো entry নেই।
        </p>
      )}

      {entries.length > 0 && (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl bg-paper ring-1 ring-line" data-testid="audit-list">
          {entries.map((e) => {
            const label = AUDIT_EVENT_LABEL[e.event as AuditEvent] ?? e.event;
            const extra = describeAudit(e);
            return (
              <li key={e.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3 text-sm" data-testid="audit-row">
                <div className="min-w-0">
                  <p className="font-semibold text-forest-900">{label}</p>
                  {extra && <p className="text-xs text-ink-soft">{extra}</p>}
                  <p className="mt-0.5 text-[11px] text-ink-soft">
                    {e.subjectType} {e.subjectId ? `· ${e.subjectId.slice(0, 8)}…` : ""} · by{" "}
                    <span className="font-medium text-forest-900">{e.actorEmail ?? (e.actorId ? e.actorId.slice(0, 8) : "system / service")}</span>
                  </p>
                </div>
                <div className="text-right">
                  {e.amount !== null && <p className="font-semibold tabular-nums text-forest-900">{formatBdt(Math.abs(e.amount))}</p>}
                  <p className="text-[11px] text-ink-soft">{fmtWhen(e.at)}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
