/**
 * Card → product flight (Batch M).
 *
 * The pre/post-page-transition trick every premium shop uses: the photo you
 * tapped grows into the photo on the product page, so the tap feels like it
 * opened *that* garment rather than swapping documents.
 *
 * How it works without experimental APIs (Next's `viewTransition` flag needs
 * React canary's <ViewTransition>, and this app runs stable React 19):
 *   1. the card records the tapped image's box + the URL the browser already
 *      painted (its `currentSrc`, i.e. the optimised one — never a cold URL);
 *   2. the product page reads that record on mount, finds its own cover image,
 *      and animates a clone from the old box to the new one (FLIP);
 *   3. the record is consumed and deleted, so a reload never replays it.
 *
 * Everything is best-effort: no record, stale record, reduced motion, missing
 * target, or a browser without WAAPI all just mean "no animation", never a
 * broken page.
 */

export const CARD_FLIGHT_KEY = "prosanti.card-flight.v1";
/** Older than this and the shopper clearly did something else in between. */
export const CARD_FLIGHT_FRESH_MS = 2500;

export interface FlightBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface CardFlight {
  /** Already-painted image URL (element.currentSrc when available). */
  src: string;
  box: FlightBox;
  slug: string;
  at: number;
}

export const boxOf = (element: Element | null): FlightBox | null => {
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
  };
};

/** The URL the browser has actually painted for this element. */
export const paintedSrcOf = (element: Element | null): string => {
  if (!element) return "";
  if (element instanceof HTMLImageElement) {
    return element.currentSrc || element.src || "";
  }
  return "";
};

export const isFlightFresh = (
  flight: CardFlight,
  now = Date.now(),
  freshMs = CARD_FLIGHT_FRESH_MS,
): boolean =>
  Number.isFinite(flight.at) &&
  flight.at <= now + 1000 && // clock skew between tabs is not a reason to fly
  now - flight.at <= freshMs;

/**
 * Maps one box onto another as a translate + scale around the top-left
 * corner — the cheapest transform the compositor can run, and the reason the
 * clone can start at the card's exact pixels on any screen size.
 */
export const flightTransform = (
  from: FlightBox,
  to: FlightBox,
): { dx: number; dy: number; scale: number } => {
  const scale = from.width > 0 ? to.width / from.width : 1;
  return {
    dx: to.left - from.left,
    dy: to.top - from.top,
    scale,
  };
};

/* ------------------------------------------------------------------ */
/* sessionStorage handoff (best-effort, never throws)                  */
/* ------------------------------------------------------------------ */

export const rememberFlight = (flight: CardFlight): void => {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(CARD_FLIGHT_KEY, JSON.stringify(flight));
  } catch {
    // private mode / quota — the page just navigates without the morph
  }
};

export const readFlight = (key = CARD_FLIGHT_KEY): CardFlight | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const { src, box, slug, at } = parsed as Partial<CardFlight>;
    if (typeof src !== "string" || src === "") return null;
    if (typeof slug !== "string" || slug === "") return null;
    if (typeof at !== "number" || !Number.isFinite(at)) return null;
    if (!box || typeof box !== "object") return null;
    const { left, top, width, height } = box as FlightBox;
    if (![left, top, width, height].every((n) => typeof n === "number")) {
      return null;
    }
    return { src, slug, at, box: { left, top, width, height } };
  } catch {
    return null;
  }
};

export const clearFlight = (key = CARD_FLIGHT_KEY): void => {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // nothing to clean up
  }
};

/** True when the shopper asked the OS for less motion. */
export const prefersReducedMotion = (): boolean => {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
};
