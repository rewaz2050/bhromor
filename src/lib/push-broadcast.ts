/**
 * Customer push broadcast — the pure rules (UX plan §12, R9).
 *
 * The shop may tell the opted-in list about a drop or an offer at most once
 * every seven days. Everything the server enforces and the admin card shows
 * is decided here so both agree and both are unit-testable without a DB.
 */

import type { Language } from "./translations";

/** Seven days between broadcasts — a weekly rhythm, never a daily nag. */
export const BROADCAST_MIN_GAP_MS = 7 * 86_400_000;
export const BROADCAST_TITLE_MAX = 60;
export const BROADCAST_BODY_MAX = 160;

export interface BroadcastDraft {
  title: string;
  titleBn: string;
  body: string;
  bodyBn: string;
  /** Same-origin path only (`/offers`, `/campaign`, `/product/<slug>`). */
  href: string;
}

const str = (v: unknown, max: number): string =>
  typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "";

/** Only same-origin paths — a push must never deep-link a shopper off-site. */
export const sanitizeBroadcastHref = (raw: unknown): string => {
  const s = typeof raw === "string" ? raw.trim().slice(0, 200) : "";
  if (s === "") return "/offers";
  if (!s.startsWith("/") || s.startsWith("//") || /[\s<>"']/.test(s)) return "/offers";
  return s;
};

export type BroadcastParse =
  | { ok: true; draft: BroadcastDraft }
  | { ok: false; error: string };

/** At least one title and one body in SOME language; the other falls back. */
export const parseBroadcast = (raw: unknown): BroadcastParse => {
  const r = (raw ?? {}) as Record<string, unknown>;
  const title = str(r.title, BROADCAST_TITLE_MAX);
  const titleBn = str(r.titleBn, BROADCAST_TITLE_MAX);
  const body = str(r.body, BROADCAST_BODY_MAX);
  const bodyBn = str(r.bodyBn, BROADCAST_BODY_MAX);
  if (title === "" && titleBn === "") return { ok: false, error: "A title is required (Bengali or English)." };
  if (body === "" && bodyBn === "") return { ok: false, error: "A message is required (Bengali or English)." };
  return {
    ok: true,
    draft: {
      title: title || titleBn,
      titleBn: titleBn || title,
      body: body || bodyBn,
      bodyBn: bodyBn || body,
      href: sanitizeBroadcastHref(r.href),
    },
  };
};

/** The payload one device receives, in the language it was reading. */
export const broadcastPayload = (
  draft: BroadcastDraft,
  lang: Language,
): { title: string; body: string; href: string } => ({
  title: lang === "bn" ? draft.titleBn : draft.title,
  body: lang === "bn" ? draft.bodyBn : draft.body,
  href: draft.href,
});

/** When the next broadcast may go out (ms epoch), or null when free now. */
export const nextBroadcastAllowedAt = (
  lastSentAtMs: number | null,
  nowMs: number = Date.now(),
): number | null => {
  if (lastSentAtMs === null || !Number.isFinite(lastSentAtMs)) return null;
  const next = lastSentAtMs + BROADCAST_MIN_GAP_MS;
  return next > nowMs ? next : null;
};
