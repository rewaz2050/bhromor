"use client";

/**
 * Admin → Access requests (2026-09-26; no SMS, no e-mail).
 *
 * Vendors and riders who forgot their password file a request from the
 * login page with the email + phone on their row. Nothing is sent to them:
 * staff CALL the number on file, confirm it is really them, and approve —
 * which opens a 24-hour window in which they set a new password themselves
 * on the login page (it polls, so the form appears on its own). Reject
 * leaves a note they see there instead.
 */

import { useState } from "react";
import Link from "next/link";
import { useAccessRequests, type AccessRequest } from "@/lib/use-access-requests";
import { useNow } from "@/lib/use-now";
import { ageLabel } from "@/lib/order-actions";
import {
  applicantLoginUrl,
  resetApprovedWhatsAppLink,
  resetRejectedWhatsAppLink,
} from "@/lib/onboarding-messages";
import { waLink } from "@/lib/whatsapp-order";
import { IconCheck, IconPhone, IconShield } from "@/components/ui/icons";
import AdminDataError from "@/components/admin/admin-data-error";

const STATUS_BADGE: Record<AccessRequest["status"], string> = {
  pending: "bg-amber-100 text-amber-900",
  approved: "bg-emerald-100 text-emerald-800",
  used: "bg-forest-100 text-forest-900",
  rejected: "bg-rose-100 text-rose-800",
  expired: "bg-ivory-200 text-ink-soft",
};

const STATUS_LABEL: Record<AccessRequest["status"], string> = {
  pending: "Pending",
  approved: "Approved — waiting for them",
  used: "Password set",
  rejected: "Rejected",
  expired: "Expired",
};

const ghost =
  "inline-flex min-h-9 items-center justify-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold ring-1 transition-colors disabled:cursor-not-allowed disabled:opacity-50";

function PendingCard({
  req,
  now,
  live,
  onDecide,
}: {
  req: AccessRequest;
  now: number;
  live: boolean;
  onDecide: (id: string, action: "approve" | "reject", note?: string) => Promise<AccessRequest | null>;
}) {
  const [verified, setVerified] = useState(false);
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [decided, setDecided] = useState<AccessRequest | null>(null);
  const kindLabel = req.kind === "vendor" ? "Shop" : "Rider";
  const verifyChat = waLink(
    req.phone,
    `PROSANTI: ${req.subjectName || req.email} — আপনি কি এইমাত্র ${req.kind === "vendor" ? "দোকান" : "রাইডার"} লগইনের পাসওয়ার্ড রিসেট চেয়েছেন? হ্যাঁ হলে এই চ্যাটে “হ্যাঁ” লিখুন; না হলে জানান।`,
  );

  const approve = async () => {
    if (!verified) return;
    if (
      !window.confirm(
        `Approve the reset for ${req.subjectName || req.email}? They get 24 hours to set a new password from the login page.`,
      )
    ) {
      return;
    }
    setBusy("approve");
    const result = await onDecide(req.id, "approve");
    setBusy(null);
    if (result) setDecided(result);
  };

  const reject = async () => {
    const note = window.prompt(
      "Reason (shown to them on the login page, optional):",
      "ফোনে নিশ্চিত করা যায়নি — আবেদনের ইমেইল ও ফোন মিলিয়ে আবার অনুরোধ করুন।",
    );
    if (note === null) return;
    setBusy("reject");
    const result = await onDecide(req.id, "reject", note);
    setBusy(null);
    if (result) setDecided(result);
  };

  if (decided) {
    const approved = decided.status === "approved";
    const wa = approved
      ? resetApprovedWhatsAppLink({ kind: req.kind, name: req.subjectName, phone: req.phone })
      : resetRejectedWhatsAppLink({ kind: req.kind, name: req.subjectName, phone: req.phone, note: decided.note });
    return (
      <li
        role="status"
        className={`rounded-2xl p-5 ring-1 ${approved ? "bg-emerald-50 ring-emerald-200" : "bg-rose-50 ring-rose-200"}`}
      >
        <p className="text-sm font-semibold text-forest-900">
          {approved ? "Approved" : "Rejected"} — {req.subjectName || req.email}
        </p>
        <p className="mt-1 text-xs text-ink-soft">
          {approved
            ? `Their login page now shows the new-password form by itself (it re-checks every 20 s). The window closes ${decided.expiresAt ? new Date(decided.expiresAt).toLocaleString("en-GB", { hour12: false }) : "in 24 hours"}.`
            : "They see the note on the login page and can file a fresh request."}
        </p>
        {wa && (
          <a href={wa} target="_blank" rel="noopener noreferrer" className={`${ghost} mt-3 bg-white text-forest-800 ring-forest-300 hover:bg-forest-800 hover:text-ivory-50`}>
            WhatsApp them →
          </a>
        )}
      </li>
    );
  }

  return (
    <li className="rounded-2xl bg-paper p-5 ring-1 ring-line">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-forest-900">{req.subjectName || req.email}</h3>
            <span className="rounded-full bg-ivory-200 px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-wider text-ink-soft">
              {kindLabel}
            </span>
            <span className={`rounded-full px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-wider ${STATUS_BADGE.pending}`}>
              {ageLabel(Date.parse(req.requestedAt), now)}
            </span>
          </div>
          <p className="mt-1 truncate text-xs text-ink-soft">
            {req.email} · {req.phone}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={`tel:${req.phone}`} className={`${ghost} bg-paper text-forest-800 ring-forest-300 hover:bg-forest-800 hover:text-ivory-50`}>
            <IconPhone className="h-3.5 w-3.5" /> Call
          </a>
          {verifyChat && (
            <a href={verifyChat} target="_blank" rel="noopener noreferrer" className={`${ghost} bg-paper text-forest-800 ring-forest-300 hover:bg-forest-800 hover:text-ivory-50`}>
              WhatsApp
            </a>
          )}
        </div>
      </div>

      <div className="mt-4 rounded-xl bg-amber-50 p-3 text-xs leading-relaxed text-amber-950 ring-1 ring-amber-200">
        <p className="font-semibold">Before approving, call {req.phone} and ask whether they requested this.</p>
        <p className="mt-1">
          The shop phone and email are semi-public — the call is the only thing proving it is the owner. Approval lets
          whoever has this email + phone pair set a new password for the next 24 hours.
        </p>
        <label className="mt-3 flex min-h-11 cursor-pointer items-center gap-2 font-semibold">
          <input
            type="checkbox"
            checked={verified}
            onChange={(e) => setVerified(e.target.checked)}
            className="h-5 w-5 rounded border-amber-400 text-forest-800 focus:ring-forest-500"
          />
          I spoke to them on {req.phone} and they confirmed the request
        </label>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!verified || busy !== null || !live}
          onClick={() => void approve()}
          className={`${ghost} bg-emerald-700 text-white ring-emerald-700 hover:bg-emerald-600`}
        >
          <IconCheck className="h-3.5 w-3.5" /> {busy === "approve" ? "Approving…" : "Approve — open 24 h window"}
        </button>
        <button
          type="button"
          disabled={busy !== null || !live}
          onClick={() => void reject()}
          className={`${ghost} bg-paper text-rose-700 ring-rose-300 hover:bg-rose-50`}
        >
          {busy === "reject" ? "Rejecting…" : "Reject with note"}
        </button>
      </div>
    </li>
  );
}

export default function AdminAccessPage() {
  const { pending, recent, ready, live, loading, error, clearError, decide, reset } = useAccessRequests();
  const now = useNow();

  if (loading) {
    return (
      <div className="space-y-6" role="status" aria-label="Loading access requests">
        <div className="h-8 w-56 animate-pulse rounded-lg bg-ivory-200" />
        <div className="h-40 animate-pulse rounded-2xl bg-paper ring-1 ring-line" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <AdminDataError label="Access requests" error={error} onRetry={reset} onDismiss={clearError} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-medium text-forest-900">Access requests</h2>
          <p className="mt-1 text-sm text-ink-soft">
            Password resets for shop and rider logins. Nothing is e-mailed or texted: you verify by phone, approve, and
            they set a new password themselves at{" "}
            <a href={applicantLoginUrl("vendor")} className="underline underline-offset-2" target="_blank" rel="noopener noreferrer">
              /vendor/login
            </a>{" "}
            or{" "}
            <a href={applicantLoginUrl("rider")} className="underline underline-offset-2" target="_blank" rel="noopener noreferrer">
              /rider/login
            </a>{" "}
            within 24 hours.
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-ivory-200 px-3 py-1 text-xs font-semibold text-ink-soft">
          <IconShield className="h-3.5 w-3.5" /> {pending.length} pending
        </span>
      </div>

      {!live && (
        <p className="rounded-2xl bg-ivory-100 px-5 py-4 text-sm text-ink-soft ring-1 ring-line">
          Sign in as staff to see reset requests.
        </p>
      )}

      {live && !ready && (
        <p className="rounded-2xl bg-amber-50 px-5 py-4 text-sm text-amber-950 ring-1 ring-amber-200">
          The reset-request table is not there yet — apply{" "}
          <code className="rounded bg-white px-1.5 py-0.5 text-xs">supabase/migrations/202609260001_password_reset_requests.sql</code>{" "}
          (docs/go-live.md step 1). Until then, use <strong>Reset password</strong> on the shop / rider card and pass the
          temporary password on by phone.
        </p>
      )}

      {live && ready && pending.length === 0 && (
        <div className="rounded-2xl bg-paper px-6 py-10 text-center ring-1 ring-line">
          <p className="font-medium text-forest-900">No reset requests waiting.</p>
          <p className="mt-1 text-sm text-ink-soft">
            When a vendor or rider taps “পাসওয়ার্ড ভুলে গেছেন?” on their login page it lands here, on the dashboard banner and
            in the bell.
          </p>
        </div>
      )}

      {pending.length > 0 && (
        <ul className="space-y-4" aria-label="Pending reset requests">
          {pending.map((req) => (
            <PendingCard key={req.id} req={req} now={now} live={live} onDecide={decide} />
          ))}
        </ul>
      )}

      {recent.length > 0 && (
        <section aria-labelledby="access-recent">
          <h3 id="access-recent" className="mb-2 text-sm font-semibold text-forest-900">
            Recent decisions
          </h3>
          <ul className="divide-y divide-line overflow-hidden rounded-2xl bg-paper ring-1 ring-line">
            {recent.map((req) => (
              <li key={req.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-xs">
                <span className="min-w-0 truncate">
                  <span className="font-semibold text-forest-900">{req.subjectName || req.email}</span>{" "}
                  <span className="text-ink-soft">
                    · {req.kind === "vendor" ? "Shop" : "Rider"} · {req.email} · {req.phone}
                  </span>
                  {req.note && <span className="block text-ink-soft">Note: {req.note}</span>}
                </span>
                <span className="flex items-center gap-2">
                  <span className="text-ink-soft">{ageLabel(Date.parse(req.requestedAt), now)} ago</span>
                  <span className={`rounded-full px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-wider ${STATUS_BADGE[req.status]}`}>
                    {STATUS_LABEL[req.status]}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-xs text-ink-soft">
        Walk-in or phone-only cases: the <Link href="/admin/shops" className="underline">shop</Link> /{" "}
        <Link href="/admin/riders" className="underline">rider</Link> card still has <strong>Reset password</strong>, which
        gives you a temporary password to read out.
      </p>
    </div>
  );
}
