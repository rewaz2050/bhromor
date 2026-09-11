"use client";

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
  const key = `${liveAuth.checked}|${liveAuth.mode ?? ""}|${customer?.id ?? ""}`;
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

/* ------------------------------ live probe -------------------------------- */

let probePromise: Promise<{
  customer: CustomerInfo | null;
  mode: "live";
}> | null = null;

/**
 * Probe `/api/account/me` once per cycle (shared promise) and publish the
 * result to the store every `useCustomer()` consumer reads from.
 */
export const probeCustomerSession = (): Promise<{
  customer: CustomerInfo | null;
  mode: "live";
}> => {
  if (!probePromise) {
    probePromise = (async () => {
      let result: { customer: CustomerInfo | null; mode: "live" };
      try {
        const res = await fetch("/api/account/me", { cache: "no-store" });
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
      } catch {
        // Network failure — treat as signed out for this cycle.
        result = { customer: null, mode: "live" as const };
      }
      setLiveAuth({
        checked: true,
        mode: result.mode,
        customer: result.customer,
      });
      return result;
    })();
  }
  return probePromise;
};

export const __resetCustomerProbe = (): void => {
  probePromise = null;
};
