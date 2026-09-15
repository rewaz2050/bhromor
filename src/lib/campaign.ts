/**
 * Campaign landing (P2 #20) — the "Eid Mega Landing" from the brief, built
 * as a shop-configurable seasonal campaign so it serves Eid, Pokher
 * Boishakh, winter drops… without a code change.
 *
 * The whole feature hangs on one honesty rule: **nothing renders a
 * countdown that isn't real.** The campaign lives in the ops settings
 * document (same store the flash drop uses); it is armed by the owner in
 * Admin → Growth with a start and an end date (Asia/Dhaka days, inclusive).
 * While unarmed the landing says so plainly and points at the shop — no
 * permanent "MEGA SALE" decoration with a fake timer.
 *
 * States:
 *   off     — not configured / dates unusable             (silent strip, honest landing)
 *   teaser  — armed, the start date has not arrived yet   (count-up to opening + early access list)
 *   live    — inside the date window                      (countdown to close + the featured grid)
 *   ended   — the end date has passed                     ("it ended" + shop link)
 */

export interface CampaignConfig {
  enabled: boolean;
  title: string;
  titleBn: string;
  subtitle: string;
  subtitleBn: string;
  /** YYYY-MM-DD — first day of the campaign (inclusive, Asia/Dhaka). */
  startDate: string;
  /** YYYY-MM-DD — last day of the campaign (inclusive, Asia/Dhaka). */
  endDate: string;
  /** Optional line for the delivery promise block (e.g. "Eid Eve: 60-min express till 9PM"). */
  expressNote: string;
  expressNoteBn: string;
  /** Product ids OR slugs — matched the same forgiving way flash scope does. */
  productIds: string[];
  /** Show the early-access email box (the list feeds the newsletter table). */
  earlyAccess: boolean;
}

export const CAMPAIGN_DEFAULTS: CampaignConfig = {
  enabled: false,
  title: "",
  titleBn: "",
  subtitle: "",
  subtitleBn: "",
  startDate: "",
  endDate: "",
  expressNote: "",
  expressNoteBn: "",
  productIds: [],
  earlyAccess: true,
};

export type CampaignState = "off" | "teaser" | "live" | "ended";

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Bangladesh is UTC+6 all year (no DST) — a fixed offset is correct (promos.ts). */
const DHAKA_OFFSET_MS = 6 * 3600 * 1000;

/** ms of the FIRST instant of a YYYY-MM-DD day in Asia/Dhaka (null if unparsable). */
export const dhakaDayStartMs = (dateStr: unknown): number | null => {
  if (typeof dateStr !== "string") return null;
  const m = DATE_RE.exec(dateStr.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const probe = new Date(Date.UTC(y, mo - 1, d));
  if (probe.getUTCMonth() !== mo - 1 || probe.getUTCDate() !== d) return null; // 2026-02-30 etc.
  return Date.UTC(y, mo - 1, d) - DHAKA_OFFSET_MS;
};

/** ms of the LAST instant (23:59:59.999) of a Dhaka day. */
export const dhakaDayEndMs = (dateStr: unknown): number | null => {
  const start = dhakaDayStartMs(dateStr);
  return start === null ? null : start + 86_400_000 - 1;
};

export interface CampaignView {
  state: CampaignState;
  title: string;
  titleBn: string;
  subtitle: string;
  subtitleBn: string;
  expressNote: string;
  expressNoteBn: string;
  /** The moment the page should refetch: opens (teaser→live) or closes (live→ended). */
  startsAtMs: number | null;
  endsAtMs: number | null;
  productIds: string[];
  earlyAccess: boolean;
  asOf: number;
}

/** Whether a config can produce a usable landing at all. */
export const campaignUsable = (c: CampaignConfig): boolean => {
  const s = dhakaDayStartMs(c.startDate);
  const e = dhakaDayEndMs(c.endDate);
  return c.enabled && s !== null && e !== null && e >= s;
};

export const campaignStateFor = (
  c: CampaignConfig,
  nowMs: number = Date.now(),
): CampaignState => {
  if (!campaignUsable(c)) return "off";
  const start = dhakaDayStartMs(c.startDate)!;
  const end = dhakaDayEndMs(c.endDate)!;
  if (nowMs < start) return "teaser";
  if (nowMs <= end) return "live";
  return "ended";
};

export const campaignView = (
  c: CampaignConfig,
  nowMs: number = Date.now(),
): CampaignView => {
  const state = campaignStateFor(c, nowMs);
  // Off = the campaign simply does not exist publicly. Ended keeps only the
  // name (so the page can say *which* campaign ended) — no timer, no picks,
  // no copy that reads like a live offer.
  const visible = state !== "off";
  return {
    state,
    title: visible ? c.title.trim() : "",
    titleBn: visible ? c.titleBn.trim() : "",
    subtitle: state === "teaser" || state === "live" ? c.subtitle.trim() : "",
    subtitleBn: state === "teaser" || state === "live" ? c.subtitleBn.trim() : "",
    expressNote: state === "live" ? c.expressNote.trim() : "",
    expressNoteBn: state === "live" ? c.expressNoteBn.trim() : "",
    startsAtMs: state === "teaser" ? dhakaDayStartMs(c.startDate) : null,
    endsAtMs: state === "live" ? dhakaDayEndMs(c.endDate) : null,
    productIds: state === "teaser" || state === "live" ? c.productIds.slice(0, 12) : [],
    earlyAccess: c.earlyAccess,
    asOf: nowMs,
  };
};

const str = (v: unknown, max: number): string =>
  typeof v === "string" ? v.trim().slice(0, max) : "";

/** Editor/API input → a safe config. Anything unusable falls back to off. */
export const sanitizeCampaign = (raw: unknown): CampaignConfig => {
  const r = (raw ?? {}) as Partial<CampaignConfig>;
  const ids = Array.isArray(r.productIds)
    ? [...new Set(r.productIds.filter((x): x is string => typeof x === "string").map((x) => x.trim().toLowerCase()).filter((x) => x !== ""))]
        .slice(0, 12)
    : [];
  const start = str(r.startDate, 10);
  const end = str(r.endDate, 10);
  const cfg: CampaignConfig = {
    enabled: r.enabled === true,
    title: str(r.title, 120),
    titleBn: str(r.titleBn, 120),
    subtitle: str(r.subtitle, 300),
    subtitleBn: str(r.subtitleBn, 300),
    startDate: dhakaDayStartMs(start) !== null ? start : "",
    endDate: dhakaDayEndMs(end) !== null ? end : "",
    expressNote: str(r.expressNote, 240),
    expressNoteBn: str(r.expressNoteBn, 240),
    productIds: ids,
    earlyAccess: r.earlyAccess !== false,
  };
  // Refuse an inverted window at the store level — a campaign that ends
  // before it starts is an operator typo, not a two-day "ended" banner.
  if (cfg.enabled) {
    const s = dhakaDayStartMs(cfg.startDate);
    const e = dhakaDayEndMs(cfg.endDate);
    if (s === null || e === null || e < s) cfg.enabled = false;
  }
  return cfg;
};

/** id-or-slug matching, mirroring the flash `selected` scope. */
export const campaignMatchesProduct = (
  view: CampaignView,
  p: { id: string; slug: string },
): boolean => {
  if (view.productIds.length === 0) return false;
  const id = p.id.toLowerCase();
  const slug = p.slug.toLowerCase();
  return view.productIds.some((x) => x === id || x === slug);
};
