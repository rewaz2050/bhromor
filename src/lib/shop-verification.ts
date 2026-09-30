/**
 * B5 (2026-09-28) — the verified-shop badge, and the words around it.
 *
 * A badge is a promise. This module keeps the promise small enough to be
 * honest:
 *
 *   • it is DERIVED — both documents checked, or nothing (`isVerified`). A
 *     stale `verifiedAt` never outlives the checks (the trigger in
 *     202609280005 clears it, and this module ignores it when the checks are
 *     gone, so the screen and the database can never disagree);
 *   • it says what it means — "ID and trade licence checked", not a vague
 *     green tick. A shopper can decide what that is worth to them;
 *   • an unverified shop is described as NOT YET CHECKED, never as suspect.
 *     Most unverified shops are simply unprocessed — calling them "unverified"
 *     in red would punish them for our queue.
 *
 * Pure: money and dates are parameters; nothing here touches the network.
 */

import type { ShopVerification } from "./catalog";

export const isVerified = (v: ShopVerification | undefined | null): boolean =>
  !!v && v.nid && v.tradeLicence && v.verifiedAt !== undefined;

/** What is still missing, in the order staff would ask for it. */
export const missingChecks = (v: ShopVerification | undefined | null): ("nid" | "tradeLicence")[] => {
  const missing: ("nid" | "tradeLicence")[] = [];
  if (!v?.nid) missing.push("nid");
  if (!v?.tradeLicence) missing.push("tradeLicence");
  return missing;
};

export const CHECK_LABEL: Record<"nid" | "tradeLicence", string> = {
  nid: "Owner's National ID",
  tradeLicence: "Trade licence",
};

/** The same two documents, phrased to sit mid-sentence. */
export const CHECK_PHRASE: Record<"nid" | "tradeLicence", string> = {
  nid: "National ID",
  tradeLicence: "trade licence",
};

/** "National ID and trade licence" — joins as English, for one or two items. */
export const checkPhraseList = (keys: readonly ("nid" | "tradeLicence")[]): string => {
  if (keys.length === 0) return "";
  if (keys.length === 1) return CHECK_PHRASE[keys[0]];
  return `${keys.slice(0, -1).map((k) => CHECK_PHRASE[k]).join(", ")} and ${CHECK_PHRASE[keys[keys.length - 1]]}`;
};

/**
 * The badge's public promise — one short line, so it fits on a card and still
 * says something real.
 */
export const verificationPromise = (): string =>
  "ID and trade licence checked by PROSANTI";

/** A tooltip-length expansion of the promise, with the date. */
export const verifiedOnLabel = (at: number, now: number = Date.now()): string => {
  const days = Math.max(0, Math.floor((now - at) / 86_400_000));
  const date = new Date(at).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  if (days === 0) return `Checked today (${date})`;
  if (days === 1) return `Checked yesterday (${date})`;
  if (days < 30) return `Checked ${days} days ago (${date})`;
  if (days < 365) {
    const months = Math.floor(days / 30);
    return `Checked ${months} ${months === 1 ? "month" : "months"} ago (${date})`;
  }
  const years = Math.floor(days / 365);
  return `Checked ${years} ${years === 1 ? "year" : "years"} ago (${date})`;
};

/** The shop-owner-facing line: what the badge says, or what is still missing. */
export const vendorVerificationLine = (v: ShopVerification | undefined | null): string => {
  if (isVerified(v)) return "Your documents are checked — the badge shows on your storefront.";
  const missing = missingChecks(v);
  if (missing.length === 2) {
    return "PROSANTI has not checked your documents yet, so the badge is not showing. Send your National ID and trade licence and it is a one-minute job for staff.";
  }
  return `${CHECK_LABEL[missing[0]]} is still to be checked — everything else is in.`;
};

/** The storefront line for a shop that has NOT been checked (neutral, never accusatory). */
export const notCheckedLine = (): string =>
  "Documents not checked by PROSANTI yet";

/* ------------------------------------------------------------------ */
/* Staff input                                                         */
/* ------------------------------------------------------------------ */

export interface VerificationPatch {
  nid: boolean;
  tradeLicence: boolean;
  /** Staff's private note — never leaves the admin surface. */
  note: string;
}

/** Max length of the staff note (matches the column: text, but keep it sane). */
export const VERIFICATION_NOTE_MAX = 400;

export const validateVerificationNote = (raw: unknown): string =>
  String(raw ?? "").trim().slice(0, VERIFICATION_NOTE_MAX);

export const validateVerificationPatch = (
  raw: unknown,
): { ok: boolean; error?: string; value: VerificationPatch } => {
  const b = (raw ?? {}) as Record<string, unknown>;
  if (typeof raw !== "object" || raw === null) {
    return { ok: false, error: "Send what was checked.", value: { nid: false, tradeLicence: false, note: "" } };
  }
  const value: VerificationPatch = {
    nid: b.nid === true,
    tradeLicence: b.tradeLicence === true,
    note: validateVerificationNote(b.note),
  };
  // Nothing to record: refuse rather than silently stamping "unverified" over
  // a shop that was never reviewed.
  if (!value.nid && !value.tradeLicence && value.note === "") {
    return { ok: false, error: "Tick what you checked, or write a note.", value };
  }
  return { ok: true, value };
};

/* ------------------------------------------------------------------ */
/* The audit trail                                                     */
/* ------------------------------------------------------------------ */

export type VerificationAction = "verified" | "unverified" | "note";

/**
 * Staff-only — the officer and the private note. Never part of a storefront or
 * vendor payload; the admin surface reads it through its own endpoint.
 */
export interface ShopVerificationAudit {
  note: string | null;
  by: string | null;
  byEmail: string | null;
  at: number | null;
}

/** The badge's paper trail: what is on the row now, plus the append-only log. */
export interface VerificationHistory {
  audit: ShopVerificationAudit;
  events: VerificationEvent[];
}

export interface VerificationEvent {
  id: number;
  shopId: string;
  at: number;
  action: VerificationAction;
  nid: boolean;
  tradeLicence: boolean;
  note: string | null;
  actorEmail: string | null;
}

export const verificationActionLabel: Record<VerificationAction, string> = {
  verified: "Verified",
  unverified: "Badge removed",
  note: "Note",
};

/** Coerce one raw log row into the typed event (never throws). */
export const parseVerificationEvent = (row: Record<string, unknown>): VerificationEvent => ({
  id: Number(row.id ?? 0),
  shopId: String(row.shop_id ?? ""),
  at: row.created_at ? Date.parse(String(row.created_at)) : 0,
  action: row.action === "verified" || row.action === "unverified" ? row.action : "note",
  nid: row.nid_checked === true,
  tradeLicence: row.trade_licence_checked === true,
  note: typeof row.note === "string" && row.note !== "" ? row.note : null,
  actorEmail: typeof row.actor_email === "string" && row.actor_email !== "" ? row.actor_email : null,
});

/**
 * The action one staff save represents — derived here so the log, the badge
 * and the shop's own screen all describe the same moment.
 */
export const actionFor = (
  before: ShopVerification | undefined | null,
  after: VerificationPatch,
): VerificationAction => {
  const was = isVerified(before);
  const now = isVerified({ nid: after.nid, tradeLicence: after.tradeLicence, verifiedAt: Date.now() });
  if (!was && now) return "verified";
  if (was && !now) return "unverified";
  return "note";
};

/** "Verified by staff@prosanti.example · 3 days ago" */
export const auditLine = (event: VerificationEvent, now: number = Date.now()): string => {
  const who = event.actorEmail ? ` by ${event.actorEmail}` : "";
  const when = verifiedOnLabel(event.at, now).replace(/^Checked /, "");
  return `${verificationActionLabel[event.action]}${who} · ${when}`;
};
