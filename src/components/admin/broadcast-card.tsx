"use client";

/**
 * Admin → Growth: the weekly "drops & offers" push (UX plan §12, R9).
 *
 * One form, both languages, a live preview of what the phone will show, the
 * size of the opted-in list, and a Send button that the server — not this
 * card — keeps to one broadcast per seven days. Nothing here pretends to be
 * SMS or email: the audience is exactly the devices that ticked the box on
 * their tracker page.
 */

import { useCallback, useEffect, useState } from "react";
import { apiErrorMessage, apiGet, apiSend } from "@/lib/admin-api";
import { field, hint, label } from "@/components/admin/form-ui";
import {
  BROADCAST_BODY_MAX,
  BROADCAST_TITLE_MAX,
  parseBroadcast,
  sanitizeBroadcastHref,
} from "@/lib/push-broadcast";
import { IconSend } from "@/components/ui/icons";

interface Status {
  configured: boolean;
  ready: boolean;
  audience: number;
  last: {
    title: string;
    titleBn: string;
    body: string;
    bodyBn: string;
    href: string;
    devices: number;
    accepted: number;
    sentAt: string;
  } | null;
  nextAllowedAt: number | null;
}

const fmtDate = (iso: string | number): string =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dhaka",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));

export default function BroadcastCard() {
  const [status, setStatus] = useState<Status | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [titleBn, setTitleBn] = useState("");
  const [title, setTitle] = useState("");
  const [bodyBn, setBodyBn] = useState("");
  const [body, setBody] = useState("");
  const [href, setHref] = useState("/offers");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setStatus(await apiGet<Status>("/api/admin/push/broadcast"));
      setLoadError(null);
    } catch (err) {
      setLoadError(apiErrorMessage(err));
    }
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- one status read on mount
  useEffect(() => void load(), [load]);

  const parsed = parseBroadcast({ title, titleBn, body, bodyBn, href });
  // The server already resolved "is the slot open?" against its own clock:
  // nextAllowedAt is null when free, so no Date.now() is needed in render.
  const locked = typeof status?.nextAllowedAt === "number";
  const canSend =
    parsed.ok && !busy && !locked && status?.configured === true && status?.ready === true && (status?.audience ?? 0) > 0;

  const send = async () => {
    if (!parsed.ok || busy) return;
    const audience = status?.audience ?? 0;
    if (!window.confirm(`Send this to ${audience} device${audience === 1 ? "" : "s"}? This uses the week's one slot.`)) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await apiSend<{ devices: number; accepted: number; sentAt: string }>(
        "/api/admin/push/broadcast",
        "POST",
        parsed.draft,
      );
      setResult(`Sent — ${res.accepted} of ${res.devices} devices accepted it (${fmtDate(res.sentAt)}).`);
      setTitle("");
      setTitleBn("");
      setBody("");
      setBodyBn("");
      await load();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div data-testid="broadcast-card">
      {loadError ? (
        <p className="text-sm text-red-700" data-testid="broadcast-error">{loadError}</p>
      ) : !status ? (
        <p className="text-sm text-ink-soft">Loading…</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 text-xs" data-testid="broadcast-status">
            <span className="rounded-full bg-forest-50 px-3 py-1 font-semibold text-forest-800">
              {status.audience} opted-in device{status.audience === 1 ? "" : "s"}
            </span>
            {!status.configured && (
              <span className="rounded-full bg-amber-50 px-3 py-1 text-amber-900 ring-1 ring-amber-200">
                Push keys (VAPID) are not set on the server.
              </span>
            )}
            {!status.ready && (
              <span className="rounded-full bg-amber-50 px-3 py-1 text-amber-900 ring-1 ring-amber-200">
                Run supabase/migrations/202609270001_push_broadcasts.sql first.
              </span>
            )}
            {locked && status.nextAllowedAt && (
              <span className="rounded-full bg-ivory-100 px-3 py-1 text-ink-soft" data-testid="broadcast-locked">
                Week&apos;s slot used — next opens {fmtDate(status.nextAllowedAt)}
              </span>
            )}
          </div>

          {status.last && (
            <p className={hint} data-testid="broadcast-last">
              Last: “{status.last.titleBn || status.last.title}” → {status.last.href} · {status.last.accepted}/{status.last.devices} accepted ·{" "}
              {fmtDate(status.last.sentAt)}
            </p>
          )}

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label className={label} htmlFor="bc-title-bn">শিরোনাম (বাংলা)</label>
              <input
                id="bc-title-bn"
                className={field}
                maxLength={BROADCAST_TITLE_MAX}
                value={titleBn}
                onChange={(e) => setTitleBn(e.target.value)}
                placeholder="ঈদের নতুন ড্রপ এসেছে"
              />
            </div>
            <div>
              <label className={label} htmlFor="bc-title">Title (English)</label>
              <input
                id="bc-title"
                className={field}
                maxLength={BROADCAST_TITLE_MAX}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="The Eid drop is here"
              />
            </div>
            <div>
              <label className={label} htmlFor="bc-body-bn">বার্তা (বাংলা)</label>
              <textarea
                id="bc-body-bn"
                className={`${field} min-h-20`}
                maxLength={BROADCAST_BODY_MAX}
                value={bodyBn}
                onChange={(e) => setBodyBn(e.target.value)}
                placeholder="নতুন পাঞ্জাবি ও থ্রি-পিস — আজ রাত ৯টা পর্যন্ত ফ্রি ডেলিভারি।"
              />
              <p className={hint}>{bodyBn.length}/{BROADCAST_BODY_MAX}</p>
            </div>
            <div>
              <label className={label} htmlFor="bc-body">Message (English)</label>
              <textarea
                id="bc-body"
                className={`${field} min-h-20`}
                maxLength={BROADCAST_BODY_MAX}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="New panjabis and three-pieces — free delivery till 9 PM tonight."
              />
              <p className={hint}>{body.length}/{BROADCAST_BODY_MAX}</p>
            </div>
            <div className="sm:col-span-2">
              <label className={label} htmlFor="bc-href">Opens</label>
              <input
                id="bc-href"
                className={field}
                value={href}
                onChange={(e) => setHref(e.target.value)}
                onBlur={() => setHref(sanitizeBroadcastHref(href))}
                placeholder="/offers"
              />
              <p className={hint}>Same-site path only — /offers, /campaign, /shop?filter=new or /product/&lt;slug&gt;.</p>
            </div>
          </div>

          {/* Preview — what the phone shows, Bengali first because the list is. */}
          {parsed.ok && (
            <div className="mt-4 rounded-xl bg-ivory-100/70 p-3.5 ring-1 ring-line" data-testid="broadcast-preview">
              <p className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-ink-soft">Preview</p>
              <p className="mt-1 text-sm font-semibold text-forest-900">{parsed.draft.titleBn}</p>
              <p className="text-xs leading-5 text-ink">{parsed.draft.bodyBn}</p>
              <p className="mt-1 text-[0.7rem] text-ink-soft">→ {parsed.draft.href}</p>
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void send()}
              disabled={!canSend}
              data-testid="broadcast-send"
              className="inline-flex h-10 items-center gap-2 rounded-full bg-forest-800 px-5 text-sm font-semibold text-white disabled:opacity-50"
            >
              <IconSend className="h-4 w-4" />
              {busy ? "Sending…" : "Send this week's broadcast"}
            </button>
            {!parsed.ok && (title || titleBn || body || bodyBn) && (
              <span className="text-xs text-ink-soft">{parsed.error}</span>
            )}
          </div>
          {result && <p className="mt-3 text-sm text-forest-800" data-testid="broadcast-result">{result}</p>}
          {error && <p className="mt-3 text-sm text-red-700" data-testid="broadcast-error">{error}</p>}
          <p className={hint}>
            Who hears it: only phones that turned on order updates on their tracker AND ticked “new drops & offers”. One
            broadcast per 7 days, enforced by the server. Each device gets its own language.
          </p>
        </>
      )}
    </div>
  );
}
