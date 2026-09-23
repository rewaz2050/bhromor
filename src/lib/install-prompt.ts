/**
 * "Add to home screen" — when to ask, and remembering the answer.
 *
 * Rules (pure, tested):
 *   • never inside an installed app (standalone display mode);
 *   • never on the first visit — the shopper has not decided they like the
 *     shop yet; the nudge appears from the second visit (a visit = a day);
 *   • a dismissal is respected for 30 days; "installed" is forever;
 *   • Android/Chrome: the real `beforeinstallprompt` sheet; iOS Safari has
 *     no such event, so the same card explains Share → Add to Home Screen.
 */

export const INSTALL_KEY = "prosanti.install-prompt.v1";
export const VISITS_KEY = "prosanti.visits.v1";
export const DISMISS_FOR_MS = 30 * 24 * 60 * 60 * 1000;
export const MIN_VISITS = 2;

export interface InstallMemory {
  /** Epoch ms of the last dismissal (0 = never). */
  dismissedAt: number;
  installed: boolean;
}

export interface VisitMemory {
  /** Distinct days this device opened the shop (capped). */
  count: number;
  /** YYYY-MM-DD of the last counted day (device clock). */
  lastDay: string;
}

export const sanitizeInstallMemory = (raw: unknown): InstallMemory => {
  const r = (raw ?? {}) as Partial<InstallMemory>;
  return {
    dismissedAt: typeof r.dismissedAt === "number" && Number.isFinite(r.dismissedAt) ? r.dismissedAt : 0,
    installed: r.installed === true,
  };
};

export const sanitizeVisits = (raw: unknown): VisitMemory => {
  const r = (raw ?? {}) as Partial<VisitMemory>;
  return {
    count: typeof r.count === "number" && Number.isFinite(r.count) && r.count > 0 ? Math.min(Math.floor(r.count), 999) : 0,
    lastDay: typeof r.lastDay === "string" ? r.lastDay : "",
  };
};

export const dayKey = (now: number = Date.now()): string => {
  const d = new Date(now);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
};

/** Count today's visit once. Returns the updated memory. */
export const countVisit = (prev: VisitMemory, now: number = Date.now()): VisitMemory => {
  const today = dayKey(now);
  if (prev.lastDay === today) return prev;
  return { count: Math.min(prev.count + 1, 999), lastDay: today };
};

export type Platform = "android" | "ios" | "other";

export const detectPlatform = (ua: string): Platform => {
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "other";
};

/** iOS Safari only — Chrome/Firefox on iOS cannot add to home screen. */
export const isIosSafari = (ua: string): boolean =>
  detectPlatform(ua) === "ios" && /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua);

export const shouldOfferInstall = (
  input: {
    memory: InstallMemory;
    visits: VisitMemory;
    standalone: boolean;
    /** Chrome fired beforeinstallprompt (Android/desktop). */
    hasNativePrompt: boolean;
    ua: string;
  },
  now: number = Date.now(),
): "native" | "ios" | null => {
  if (input.standalone || input.memory.installed) return null;
  if (input.visits.count < MIN_VISITS) return null;
  if (input.memory.dismissedAt > 0 && now - input.memory.dismissedAt < DISMISS_FOR_MS) return null;
  if (input.hasNativePrompt) return "native";
  if (isIosSafari(input.ua)) return "ios";
  return null;
};

/* ---- storage (browser only; every read tolerates blocked storage) ---- */

const read = <T,>(key: string, sanitize: (raw: unknown) => T): T => {
  if (typeof window === "undefined") return sanitize(null);
  try {
    const raw = window.localStorage.getItem(key);
    return sanitize(raw ? JSON.parse(raw) : null);
  } catch {
    return sanitize(null);
  }
};

const write = (key: string, value: unknown) => {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage blocked — the prompt simply asks again next time */
  }
};

export const readInstallMemory = (): InstallMemory => read(INSTALL_KEY, sanitizeInstallMemory);
export const writeInstallMemory = (m: InstallMemory): void => write(INSTALL_KEY, m);
export const readVisits = (): VisitMemory => read(VISITS_KEY, sanitizeVisits);
export const writeVisits = (v: VisitMemory): void => write(VISITS_KEY, v);

export const isStandalone = (): boolean => {
  if (typeof window === "undefined") return false;
  try {
    return (
      window.matchMedia?.("(display-mode: standalone)")?.matches === true ||
      (navigator as { standalone?: boolean }).standalone === true
    );
  } catch {
    return false;
  }
};
