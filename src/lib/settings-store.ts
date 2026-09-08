/**
 * Operational settings (§58) — configurable low-stock threshold for the
 * inventory alerts. Browser-local demo store; the Supabase phase moves it
 * to `site_settings` (blueprint §44).
 */

export const SETTINGS_STORAGE_KEY = "prosanti.admin.settings.v1";

export interface AdminSettings {
  lowStockThreshold: number;
}

export const SETTINGS_DEFAULTS: AdminSettings = { lowStockThreshold: 5 };

/* ------------------------------------------------------------------ */

type Listener = () => void;

let cache: AdminSettings | null = null;
let loaded = false;
const listeners = new Set<Listener>();

const notify = () => {
  for (const l of listeners) l();
};

export const sanitizeSettings = (raw: unknown): AdminSettings => {
  const p = (raw ?? {}) as Partial<AdminSettings>;
  const threshold =
    typeof p.lowStockThreshold === "number" &&
    Number.isFinite(p.lowStockThreshold)
      ? Math.max(0, Math.floor(p.lowStockThreshold))
      : SETTINGS_DEFAULTS.lowStockThreshold;
  return { lowStockThreshold: threshold };
};

const ensureLoaded = (): AdminSettings => {
  if (cache && loaded) return cache;
  loaded = true;
  if (typeof window !== "undefined") {
    try {
      const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (raw) cache = sanitizeSettings(JSON.parse(raw));
    } catch {
      // corrupted storage → defaults
    }
  }
  cache ??= SETTINGS_DEFAULTS;
  return cache;
};

const persist = (next: AdminSettings) => {
  cache = next;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // storage unavailable — demo continues in memory
    }
  }
  notify();
};

export const subscribeSettings = (listener: Listener): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const getSettings = (): AdminSettings => ensureLoaded();

export const getSettingsServer = (): AdminSettings => SETTINGS_DEFAULTS;

export const saveSettings = (settings: AdminSettings) =>
  persist(sanitizeSettings(settings));

export const resetSettings = () => {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(SETTINGS_STORAGE_KEY);
  }
  persist(SETTINGS_DEFAULTS);
};
