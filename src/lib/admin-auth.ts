/**
 * Admin session helpers (§47) — demo phase.
 *
 * The blueprint requires server/database-enforced authorization before
 * launch; until Supabase Auth + admin_users exist, this client-side gate
 * only shapes the demo UI and is NOT a security boundary.
 */

export const ADMIN_SESSION_KEY = "prosanti.admin.session.v1";

/** Demo credentials — replaced by real admin authentication later. */
export const DEMO_ADMIN = {
  email: "admin@prosanti.store",
  password: "prosanti",
};

/* External store so components can read auth with useSyncExternalStore
 * (hydration-safe, no setState-in-effect lint issues). */
type Listener = () => void;
let authed: boolean | null = null;
const listeners = new Set<Listener>();

const notify = () => {
  for (const l of listeners) l();
};

export const subscribeAdminAuth = (listener: Listener): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const getAdminAuthed = (): boolean => {
  if (authed === null) {
    authed =
      typeof window !== "undefined" &&
      window.localStorage.getItem(ADMIN_SESSION_KEY) === "1";
  }
  return authed;
};

export const isAdminAuthed = (): boolean => getAdminAuthed();

export const signInAdmin = (email: string, password: string): boolean => {
  if (
    email.trim().toLowerCase() === DEMO_ADMIN.email &&
    password === DEMO_ADMIN.password
  ) {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(ADMIN_SESSION_KEY, "1");
    }
    authed = true;
    notify();
    return true;
  }
  return false;
};

export const signOutAdmin = (): void => {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(ADMIN_SESSION_KEY);
  }
  authed = false;
  notify();
};
