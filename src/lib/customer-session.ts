"use client";

/**
 * Customer session — single shared probe + stores (live and demo).
 *
 * Live mode: the httpOnly session cookie is probed via GET /api/account/me
 * (module-cached per refresh cycle). The cookie is unreadable from JS by
 * design, so "signed in" always comes from this probe — and the result lives
 * in a SHARED store below, so every hook instance sees the login instantly
 * (per-instance state once left the account panel stuck on the form after a
 * successful signup/login — that regression is locked out by tests).
 *
 * Demo mode (no Supabase keys): accounts live in localStorage — signup is
 * instant and verification-free, mirroring the live API contract. Passwords
 * are salted SHA-256 (demo-trust level, same as every other local store).
 */

import { normalizePhone } from "./orders";

export interface CustomerInfo {
  id: string;
  name: string;
  phone: string;
}

export type SessionMode = "live" | "demo";

export interface AuthSnapshot {
  checked: boolean;
  mode: SessionMode | null;
  customer: CustomerInfo | null;
}

const ACCOUNTS_KEY = "prosanti.customers.v1";
const SESSION_KEY = "prosanti.customer-session.v1";

interface DemoAccount extends CustomerInfo {
  salt: string;
  hash: string;
  createdAt: string;
}

/* --------------------------- session store (shared) ----------------------- */

type Listener = () => void;
const listeners = new Set<Listener>();

let demoSession: { customer: CustomerInfo | null } = { customer: null };
let demoLoaded = false;

/** Result of the live probe, shared by every hook instance. */
let liveAuth: { checked: boolean; mode: SessionMode | null; customer: CustomerInfo | null } = {
  checked: false,
  mode: null,
  customer: null,
};

const notify = () => {
  for (const l of listeners) l();
};

const loadDemo = (): void => {
  if (demoLoaded || typeof window === "undefined") return;
  demoLoaded = true;
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { customer?: CustomerInfo | null };
      if (parsed?.customer?.id) demoSession = { customer: parsed.customer };
    }
  } catch {
    /* corrupted state — stay signed out */
  }
};

const persistDemo = (): void => {
  try {
    if (demoSession.customer) {
      window.localStorage.setItem(SESSION_KEY, JSON.stringify(demoSession));
    } else {
      window.localStorage.removeItem(SESSION_KEY);
    }
  } catch {
    /* storage full/blocked — session stays in memory */
  }
  notify();
};

export const subscribeCustomerAuth = (l: Listener): (() => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

export const getCustomerSnapshot = (): { customer: CustomerInfo | null } => {
  loadDemo();
  return demoSession;
};

export const getCustomerServerSnapshot = (): { customer: CustomerInfo | null } => ({
  customer: null,
});

/**
 * Combined snapshot for `useSyncExternalStore`. Identity is stable between
 * real changes (BUGFIXES §7/§10: a fresh object per call re-renders forever),
 * so a key of the visible values gates the rebuild.
 */
let authSnapshot: AuthSnapshot = { checked: false, mode: null, customer: null };
let authKey = "";

const visibleCustomer = (): CustomerInfo | null =>
  liveAuth.mode === "live"
    ? liveAuth.customer
    : liveAuth.mode === "demo"
      ? demoSession.customer
      : null;

const getAuthSnapshot = (): AuthSnapshot => {
  loadDemo();
  const customer = visibleCustomer();
  const key = `${liveAuth.checked}|${liveAuth.mode ?? ""}|${customer?.id ?? ""}`;
  if (key !== authKey) {
    authKey = key;
    authSnapshot = { checked: liveAuth.checked, mode: liveAuth.mode, customer };
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

const setDemoSession = (customer: CustomerInfo | null): void => {
  demoSession = { customer };
  persistDemo();
};

/* ------------------------------- demo auth -------------------------------- */

const readAccounts = (): DemoAccount[] => {
  try {
    const raw = window.localStorage.getItem(ACCOUNTS_KEY);
    return raw ? (JSON.parse(raw) as DemoAccount[]) : [];
  } catch {
    return [];
  }
};

const writeAccounts = (accounts: DemoAccount[]): void => {
  try {
    window.localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
  } catch {
    /* ignore */
  }
};

const sha256Hex = async (text: string): Promise<string> => {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
};

const validPhone = (raw: string): string | null => {
  const phone = normalizePhone(raw.trim());
  return /^01[0-9]{9}$/.test(phone) ? phone : null;
};

export type AuthResult = { ok: true } | { ok: false; error: string };

export const demoSignup = async (input: {
  name: string;
  phone: string;
  password: string;
}): Promise<AuthResult> => {
  const name = input.name.trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 80) {
    return { ok: false, error: "নাম ২–৮০ অক্ষরের হতে হবে।" };
  }
  const phone = validPhone(input.phone);
  if (!phone) {
    return { ok: false, error: "সঠিক মোবাইল নম্বর দিন (যেমন 01712345678)।" };
  }
  if (input.password.length < 6) {
    return { ok: false, error: "পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে।" };
  }
  const accounts = readAccounts();
  if (accounts.some((a) => a.phone === phone)) {
    return { ok: false, error: "এই নম্বরে অ্যাকাউন্ট আগেই আছে — লগ ইন করুন।" };
  }
  const salt = Array.from(crypto.getRandomValues(new Uint8Array(12)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const account: DemoAccount = {
    id: crypto.randomUUID(),
    name,
    phone,
    salt,
    hash: await sha256Hex(`${salt}:${input.password}`),
    createdAt: new Date().toISOString(),
  };
  writeAccounts([...accounts, account]);
  setDemoSession({ id: account.id, name: account.name, phone: account.phone });
  return { ok: true };
};

export const demoLogin = async (input: {
  phone: string;
  password: string;
}): Promise<AuthResult> => {
  const phone = validPhone(input.phone);
  const account = phone
    ? readAccounts().find((a) => a.phone === phone)
    : undefined;
  const hash = account ? await sha256Hex(`${account.salt}:${input.password}`) : "";
  if (!account || hash !== account.hash) {
    return { ok: false, error: "নম্বর বা পাসওয়ার্ড মিলছে না।" };
  }
  setDemoSession({ id: account.id, name: account.name, phone: account.phone });
  return { ok: true };
};

export const demoLogout = (): void => {
  setDemoSession(null);
};

/* ------------------------------ live probe -------------------------------- */

let probePromise: Promise<{
  customer: CustomerInfo | null;
  mode: "live" | "demo";
}> | null = null;

/**
 * Probe `/api/account/me` once per cycle (shared promise) and publish the
 * result to the store every `useCustomer()` consumer reads from. The
 * resolved shape is unchanged for existing callers.
 */
export const probeCustomerSession = (): Promise<{
  customer: CustomerInfo | null;
  mode: "live" | "demo";
}> => {
  if (!probePromise) {
    probePromise = (async () => {
      let result: { customer: CustomerInfo | null; mode: "live" | "demo" };
      try {
        const res = await fetch("/api/account/me", { cache: "no-store" });
        if (res.status === 401) {
          result = { customer: null, mode: "live" as const };
        } else {
          const body = (await res.json().catch(() => ({}))) as {
            customer?: CustomerInfo | null;
            demoMode?: boolean;
          };
          if (body.demoMode) {
            loadDemo();
            result = { customer: demoSession.customer, mode: "demo" as const };
          } else if (res.ok && body.customer?.id) {
            result = { customer: body.customer, mode: "live" as const };
          } else {
            result = { customer: null, mode: "live" as const };
          }
        }
      } catch {
        // Network failure — fall back to the demo store for this session.
        loadDemo();
        result = { customer: demoSession.customer, mode: "demo" as const };
      }
      // Publish for ALL consumers, not just the one that triggered the probe.
      setLiveAuth({
        checked: true,
        mode: result.mode,
        customer: result.mode === "live" ? result.customer : null,
      });
      return result;
    })();
  }
  return probePromise;
};

export const __resetCustomerProbe = (): void => {
  probePromise = null;
};
