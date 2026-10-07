"use client";

import { fetchWithDeadline } from "./fetch-with-deadline";

/**
 * Customer session — live only.
 *
 * The httpOnly session cookie is probed via GET /api/account/me (module-cached
 * per refresh cycle). The cookie is unreadable from JS by design, so
 * "signed in" always comes from this probe — and the result lives in a SHARED
 * store below, so every hook instance sees the login instantly.
 */

export interface CustomerInfo {
  id: string;
  name: string;
  phone: string;
}

export type SessionMode = "live";

export interface AuthSnapshot {
  checked: boolean;
  mode: SessionMode | null;
  customer: CustomerInfo | null;
}

/* --------------------------- session store (shared) ----------------------- */

type Listener = () => void;
const listeners = new Set<Listener>();

/** Result of the live probe, shared by every hook instance. */
let liveAuth: { checked: boolean; mode: SessionMode | null; customer: CustomerInfo | null } = {
  checked: false,
  mode: null,
  customer: null,
};

const notify = () => {
  for (const l of listeners) l();
};

export const subscribeCustomerAuth = (l: Listener): (() => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

/**
 * Combined snapshot for `useSyncExternalStore`. Identity is stable between
 * real changes, so a key of the visible values gates the rebuild.
 */
let authSnapshot: AuthSnapshot = { checked: false, mode: null, customer: null };
let authKey = "";

const getAuthSnapshot = (): AuthSnapshot => {
  const customer = liveAuth.customer;
  const key = JSON.stringify([liveAuth.checked, liveAuth.mode, customer?.id, customer?.name, customer?.phone]);
  if (key !== authKey) {
    authKey = key;
    authSnapshot = {
      checked: liveAuth.checked,
      mode: liveAuth.mode,
      customer,
    };
  }
  return authSnapshot;
};

const AUTH_SERVER_SNAPSHOT: AuthSnapshot = {
  checked: false,
  mode: null,
  customer: null,
};

export { getAuthSnapshot, AUTH_SERVER_SNAPSHOT };

const setLiveAuth = (
  next: Partial<typeof liveAuth> & { checked?: boolean; mode?: SessionMode | null; customer?: CustomerInfo | null },
): void => {
  liveAuth = { ...liveAuth, ...next };
  notify();
};

/** Test escape hatch: put the shared live store back to its initial state. */
export const __resetLiveAuthForTests = (): void => {
  liveAuth = { checked: false, mode: null, customer: null };
  __resetCustomerProbe();
  notify();
};

/**
 * What the SERVER already proved, handed to the first paint (account
 * loading pass 2026-10-07).
 *
 * The storefront used to ship "সেশন চেক করা হচ্ছে…" in the HTML and swap the
 * whole page a moment later — every visit, for every shopper, including one
 * who has been signed in for months. Seeding lets the browser start from the
 * server's answer: no spinner, no swap, and the probe afterwards only has to
 * confirm (or correct) it.
 *
 * Never clears a truth the client already holds — a later seed (a second
 * mount) must not undo a sign-in that has happened since.
 */
export const seedCustomerSession = (customer: CustomerInfo | null): void => {
  if (liveAuth.checked) return;
  setLiveAuth({ checked: true, mode: "live", customer });
};

/* ------------------------------ live probe -------------------------------- */

let probePromise: Promise<{
  customer: CustomerInfo | null;
  mode: "live";
}> | null = null;

/**
 * Probe `/api/account/me` once per cycle (shared promise) and publish the
 * result to the store every `useCustomer()` consumer reads from.
 */
/**
 * How long the probe may hang before the page stops waiting for it. A phone
 * on a dying connection used to sit on "checking…" forever, because a fetch
 * that never answers is indistinguishable from one still thinking.
 */
export const SESSION_PROBE_TIMEOUT_MS = 8_000;

export const probeCustomerSession = (): Promise<{
  customer: CustomerInfo | null;
  mode: "live";
}> => {
  if (!probePromise) {
    probePromise = (async () => {
      let result: { customer: CustomerInfo | null; mode: "live" };
      try {
        const res = await fetchWithDeadline(
          "/api/account/me",
          { cache: "no-store" },
          SESSION_PROBE_TIMEOUT_MS,
        );
        if (res.status === 401) {
          result = { customer: null, mode: "live" as const };
        } else {
          const body = (await res.json().catch(() => ({}))) as {
            customer?: CustomerInfo | null;
          };
          result = {
            customer: res.ok && body.customer?.id ? body.customer : null,
            mode: "live" as const,
          };
        }
        // A DEFINITIVE answer (200 or 401) is the truth — it may correct a
        // seed whose session expired between the render and this probe.
        setLiveAuth({
          checked: true,
          mode: result.mode,
          customer: result.customer,
        });
      } catch {
        // A slow or broken network is NOT a sign-out. Keep whatever is known
        // (the server's seed, or simply "unknown") and stop the spinner — a
        // page that waits forever is worse than one that waits too little.
        result = { customer: liveAuth.customer, mode: "live" as const };
        setLiveAuth({ checked: true });
      }
      return result;
    })();
  }
  return probePromise;
};

export const __resetCustomerProbe = (): void => {
  probePromise = null;
};
