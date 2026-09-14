/**
 * Live shopping sessions (P1 #9) — domain types + pure helpers.
 *
 * The shop streams on its OWN platform (YouTube Live, Facebook Live, …);
 * this module is the shopping surface around that real stream. Client-safe:
 * no server imports, so the storefront, the admin page and route handlers
 * share the same parsing/validation rules.
 */

import { extractYoutubeId } from "./media";

export type LiveSessionStatus = "scheduled" | "live" | "ended";

export interface LiveSessionProduct {
  productId: string;
  name: string;
  slug: string;
  price: number; // integer paisa
  image?: string;
  inStock: boolean;
  /** First active "Color · Size" — the same rule as the storefront Quick Add. */
  defaultVariantLabel: string;
  /** True for the single piece "on air" right now. */
  onAir: boolean;
}

export interface LiveSession {
  id: string;
  title: string;
  description: string;
  /** The shop's live URL, or "" if not set yet. */
  streamUrl: string;
  /** YouTube id derived from streamUrl (null = external link only). */
  youtubeId: string | null;
  scheduledStart: number; // epoch ms
  liveAt?: number;
  endedAt?: number;
  status: LiveSessionStatus;
  /** Products in the order the shop shows them. */
  products: LiveSessionProduct[];
}

export type LiveSessionState = "upcoming" | "live" | "ended";

/**
 * The state the storefront shows. Driven by the shop's own taps, not by a
 * timer: 'scheduled' is upcoming even after its scheduled time (the shop
 * hasn't gone live yet), 'live' is live, 'ended' is over.
 */
export const liveState = (s: Pick<LiveSession, "status">): LiveSessionState =>
  s.status === "live" ? "live" : s.status === "ended" ? "ended" : "upcoming";

/**
 * Parse a pasted live URL: YouTube links yield a youtubeId (the site can
 * embed the shop's real player); anything else is kept as an external watch
 * link. Plain "" stays null.
 */
export const parseStreamUrl = (
  raw: unknown,
): { url: string; youtubeId: string | null } => {
  const url = typeof raw === "string" ? raw.trim().slice(0, 500) : "";
  const youtubeId = url ? extractYoutubeId(url) : null;
  return { url, youtubeId };
};

export interface LiveSessionInput {
  title: string;
  description?: string;
  streamUrl?: string;
  /** epoch ms — when the shop announced it will go live. */
  startsAt: number;
  /** Ordered, unique real product ids. */
  productIds: string[];
}

export type LiveSessionError = { field: "title" | "description" | "streamUrl" | "startsAt" | "products"; message: string };

const isHttpUrl = (v: string): boolean => {
  try {
    const u = new URL(v);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
};

/**
 * Validate + normalise a create/update payload. Product ids are checked
 * against the REAL catalog ids the caller passes (live rows, not the seed
 * catalog), so a deleted or wrong id can never be featured.
 */
export interface ValidatedLiveSession {
  title: string;
  description: string;
  streamUrl: string;
  youtubeId: string | null;
  startsAt: number;
  /** De-duplicated, in order, real catalog ids only. */
  productIds: string[];
}

export function validateLiveSessionInput(
  input: LiveSessionInput,
  knownProductIds: ReadonlySet<string>,
  now = Date.now(),
): { value?: ValidatedLiveSession; errors: LiveSessionError[] } {
  const errors: LiveSessionError[] = [];

  const title = (input.title ?? "").trim().slice(0, 120);
  if (title.length < 3) errors.push({ field: "title", message: "Give the session a title (3+ characters)." });

  const description = (input.description ?? "").trim().slice(0, 500);

  const { url, youtubeId } = parseStreamUrl(input.streamUrl);
  if (url && !isHttpUrl(url)) {
    errors.push({ field: "streamUrl", message: "Paste a full https live link (YouTube Live, Facebook Live, …)." });
  }

  if (!Number.isFinite(input.startsAt)) {
    errors.push({ field: "startsAt", message: "Pick when the session starts." });
  } else if (input.startsAt < now - 24 * 3600 * 1000) {
    // Far in the past = almost certainly a form mistake. A slightly-past
    // start is fine — shops start late all the time.
    errors.push({ field: "startsAt", message: "The start time can't be more than a day in the past." });
  }

  // Unique, in-order, real products only.
  const seen = new Set<string>();
  const productIds: string[] = [];
  for (const raw of input.productIds ?? []) {
    if (typeof raw !== "string") continue;
    const id = raw.trim();
    if (!id || seen.has(id) || productIds.length >= 30) continue;
    if (!knownProductIds.has(id)) {
      errors.push({ field: "products", message: "One of the chosen pieces is no longer in the catalog." });
      break;
    }
    seen.add(id);
    productIds.push(id);
  }
  if (productIds.length === 0) {
    errors.push({ field: "products", message: "Pick at least one piece to show in the session." });
  }

  if (errors.length > 0) return { errors };
  return {
    value: {
      title,
      description,
      streamUrl: url,
      youtubeId,
      startsAt: Math.floor(input.startsAt),
      productIds,
    },
    errors,
  };
}
