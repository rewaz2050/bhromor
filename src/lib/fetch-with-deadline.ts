/**
 * fetch() that gives up (account loading pass 2026-10-07).
 *
 * A request that never answers looks exactly like a slow one, so a panel
 * waiting on it spins forever — on a phone that lost the network between the
 * tap and the response, "লোড হচ্ছে…" is not a loading state, it is a dead
 * end. Every read the shopper is waiting on gets a deadline; when it passes,
 * the caller shows its error state WITH a retry instead of a spinner that
 * has stopped meaning anything.
 *
 * Pure (unit-tested) apart from the network itself.
 */

/** Long enough for a slow Bangladesh mobile round trip, short enough to feel answered. */
export const FETCH_DEADLINE_MS = 12_000;

export class FetchDeadlineError extends Error {
  readonly timeoutMs: number;
  constructor(timeoutMs: number) {
    super(`gave up after ${timeoutMs}ms`);
    this.name = "FetchDeadlineError";
    this.timeoutMs = timeoutMs;
  }
}

/**
 * A DOMException is NOT an `instanceof Error` in every runtime — the name is
 * the only portable tell that this rejection is our own deadline.
 */
const isAbort = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  (error as { name?: unknown }).name === "AbortError";

/**
 * `fetch` with a deadline. Any `signal` in `init` is replaced by the
 * deadline's own — a caller that needs to cancel as well should abort the
 * request it gets back, or pass a shorter timeout.
 */
export const fetchWithDeadline = async (
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs: number = FETCH_DEADLINE_MS,
): Promise<Response> => {
  if (typeof AbortController === "undefined") return fetch(input, init);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (isAbort(error)) throw new FetchDeadlineError(timeoutMs);
    throw error;
  } finally {
    clearTimeout(timer);
  }
};
