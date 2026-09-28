"use client";

/**
 * B5 (2026-09-28) — staff verify a shop.
 *
 * Deliberately boring to use right: two boxes for the two documents staff
 * actually held, a private note, and the trail of who did what. The badge is
 * NOT a third switch — it is whatever the two boxes add up to, so nobody can
 * hand out a badge without the paperwork behind it. Un-ticking either box
 * removes the badge, and the card says that before it happens.
 *
 * Presentational + plain props (the page passes the hooks), so both the rules
 * and the copy are testable without a network.
 */

import { useState } from "react";
import {
  auditLine,
  isVerified,
  missingChecks,
  verificationActionLabel,
  type VerificationEvent,
} from "@/lib/shop-verification";
import type { ShopVerification } from "@/lib/catalog";

export interface VerificationAuditView {
  note: string | null;
  byEmail: string | null;
  at: number | null;
}

export default function ShopVerificationCard({
  verification,
  audit,
  events = [],
  onSave,
  onRefresh,
}: {
  verification?: ShopVerification | null;
  /** Staff-only note / officer — never shown to the shopper or the vendor. */
  audit?: VerificationAuditView | null;
  events?: VerificationEvent[];
  onSave: (patch: { nid: boolean; tradeLicence: boolean; note: string }) => Promise<void>;
  onRefresh?: () => void;
}) {
  // The form is remounted (keyed) whenever the row it edits changes, so a
  // refresh or another staff member's save replaces the inputs instead of
  // fighting them — no effect needed to copy props into state.
  const [nid, setNid] = useState(verification?.nid === true);
  const [licence, setLicence] = useState(verification?.tradeLicence === true);
  const [note, setNote] = useState(audit?.note ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const wasVerified = isVerified(verification);
  const willBeVerified = nid && licence;
  const dirty =
    nid !== (verification?.nid === true) ||
    licence !== (verification?.tradeLicence === true) ||
    note.trim() !== (audit?.note ?? "");

  const save = async () => {
    if (!nid && !licence && note.trim() === "") {
      setError("Tick what you checked, or write a note.");
      return;
    }
    setSaving(true);
    setError(null);
    setSaved(null);
    try {
      await onSave({ nid, tradeLicence: licence, note: note.trim() });
      setSaved(willBeVerified ? "Verified — the badge is on the storefront." : "Saved — no badge while a document is unchecked.");
      onRefresh?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save — try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section
      aria-label="Verify this shop"
      className="rounded-xl bg-ivory-50 p-4 ring-1 ring-line sm:col-span-2"
      data-testid="verification-card"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-ink-soft">
          Verification
        </h4>
        <span
          data-testid="verification-state"
          className={`rounded-full px-2.5 py-0.5 text-[0.62rem] font-bold uppercase tracking-wide ${
            wasVerified ? "bg-forest-100 text-forest-900" : "bg-ivory-200 text-ink-soft"
          }`}
        >
          {wasVerified ? "Verified" : "Not verified"}
        </span>
      </div>

      <p className="mt-1 text-[0.68rem] leading-5 text-ink-soft">
        Both documents must be checked for the badge to show. Remove either one and the badge,
        the timestamp and the officer are cleared — the badge cannot outlive the paperwork.
      </p>

      <div className="mt-3 flex flex-wrap gap-4">
        <label className="inline-flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={nid}
            onChange={(e) => setNid(e.target.checked)}
            data-testid="verify-nid"
            className="h-4 w-4 rounded accent-forest-700"
          />
          Owner&rsquo;s National ID seen
        </label>
        <label className="inline-flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={licence}
            onChange={(e) => setLicence(e.target.checked)}
            data-testid="verify-licence"
            className="h-4 w-4 rounded accent-forest-700"
          />
          Trade licence seen
        </label>
      </div>

      <label className="mt-3 block">
        <span className="text-xs font-medium text-ink-soft">
          Private note (staff only — never shown to the shopper or the shop)
        </span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value.slice(0, 400))}
          rows={2}
          data-testid="verify-note"
          placeholder="e.g. NID 1234…, licence 2024-117, seen 28 Sep"
          className="mt-1 w-full rounded-xl bg-paper px-3 py-2 text-sm ring-1 ring-line focus:ring-2 focus:ring-forest-500"
        />
      </label>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving || !dirty}
          data-testid="verify-save"
          className="rounded-full bg-forest-800 px-5 py-2 text-xs font-semibold text-ivory-50 hover:bg-forest-700 disabled:opacity-40"
        >
          {saving ? "Saving…" : "Save verification"}
        </button>
        {wasVerified && !willBeVerified && (
          <span className="text-xs font-medium text-amber-900" data-testid="verify-warning">
            Saving removes the badge from this shop&rsquo;s storefront.
          </span>
        )}
        {!wasVerified && willBeVerified && (
          <span className="text-xs font-medium text-forest-800" data-testid="verify-gain">
            Saving puts the badge on this shop&rsquo;s storefront.
          </span>
        )}
        {saved && (
          <span role="status" className="text-xs font-medium text-forest-800">
            {saved}
          </span>
        )}
        {error && (
          <span role="alert" className="text-xs font-medium text-red-700">
            {error}
          </span>
        )}
      </div>

      {missingChecks(verification).length > 0 && (
        <p className="mt-2 text-[0.68rem] text-ink-soft" data-testid="verify-missing">
          Still unchecked:{" "}
          {missingChecks(verification)
            .map((k) => (k === "nid" ? "National ID" : "trade licence"))
            .join(" and ")}
          .
        </p>
      )}

      {/* Shown once the trail has been loaded — "never verified" is worth
          saying out loud, because staff then know nobody has looked yet. */}
      {audit && (
        <div className="mt-4 border-t border-line pt-3" data-testid="verify-history">
          <p className="text-[0.62rem] font-semibold uppercase tracking-wider text-ink-soft">
            Who checked
          </p>
          {audit?.at ? (
            <p className="mt-1 text-xs text-ink">
              Verified
              {audit.byEmail ? ` by ${audit.byEmail}` : ""} ·{" "}
              {new Date(audit.at).toLocaleString("en-GB", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </p>
          ) : (
            <p className="mt-1 text-xs text-ink-soft">Never verified.</p>
          )}
          {events.length > 0 && (
            <ul className="mt-2 space-y-1">
              {events.slice(0, 6).map((e) => (
                <li key={e.id} className="text-[0.68rem] text-ink-soft">
                  <span className="font-semibold text-ink">{verificationActionLabel[e.action]}</span>{" "}
                  · {auditLine(e)}
                  {e.note ? ` · “${e.note}”` : ""}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
