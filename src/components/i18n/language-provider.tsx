"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  LANGUAGE_COOKIE_KEY,
  translations,
  type Language,
  type TranslationKey,
} from "@/lib/translations";

type LanguageContextValue = {
  lang: Language;
  setLang: (lang: Language) => void;
  t: (key: TranslationKey) => string;
  dict: (typeof translations)[Language];
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

export const LANGUAGE_STORAGE_KEY = LANGUAGE_COOKIE_KEY;
const STORAGE_KEY = LANGUAGE_STORAGE_KEY;

/** The stored choice (localStorage first, then the cookie) — or null. */
export const readStoredLanguage = (): Language | null => {
  if (typeof window === "undefined") return null;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "en" || stored === "bn") return stored;
  } catch {
    // storage blocked — fall through to the cookie
  }
  const match = /(?:^|;\s*)prosanti-lang=(en|bn)(?:;|$)/.exec(document.cookie ?? "");
  return match ? (match[1] as Language) : null;
};

/**
 * The language the shopper sees before any stored preference is read.
 * The storefront passes "bn" (UX audit 2026-09-18, P1 #8 — the customers are
 * in Sunamganj, so Bangla is the default and English is the switch); tests
 * and the staff surfaces keep the English default.
 */
export function LanguageProvider({
  children,
  initialLang = "en",
}: {
  children: ReactNode;
  initialLang?: Language;
}) {
  const [lang, setLangState] = useState<Language>(initialLang);

  // The storefront already painted the language this device chose — the
  // server read the cookie and passed it down as `initialLang`. So this only
  // ever CORRECTS: a device whose localStorage disagrees with the cookie
  // (an older session, a blocked cookie write) gets its own answer back, and
  // every other device renders on without a second pass over the whole tree.
  useEffect(() => {
    try {
      const stored = readStoredLanguage();
      // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is only readable in the browser; this corrects, it does not decide
      if (stored && stored !== initialLang) setLangState(stored);
      document.documentElement.lang = (stored ?? initialLang) === "bn" ? "bn" : "en";
    } catch {
      // ignore storage errors
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initialLang is a mount-time default
  }, []);

  // Write only when the shopper actually chose — the server's answer is
  // already stored (it came from the same cookie), so a page load writes
  // nothing. Writing on every mount also meant every visit re-touched
  // localStorage before the first paint had settled.
  const lastWritten = useRef<Language | null>(null);
  useEffect(() => {
    document.documentElement.lang = lang === "bn" ? "bn" : "en";
    if (lastWritten.current === null || lastWritten.current === lang) {
      lastWritten.current = lang;
      return;
    }
    lastWritten.current = lang;
    try {
      window.localStorage.setItem(STORAGE_KEY, lang);
      // also set cookie for the server to read on the next page
      document.cookie = `${STORAGE_KEY}=${lang}; path=/; max-age=31536000; samesite=lax`;
    } catch {
      // ignore
    }
  }, [lang]);

  const setLang = (next: Language) => {
    setLangState(next);
  };

  const t = useMemo(() => {
    return (key: TranslationKey): string => {
      const parts = key.split(".");
      let cur: unknown = translations[lang];
      for (const p of parts) {
        if (cur && typeof cur === "object" && p in (cur as Record<string, unknown>)) {
          cur = (cur as Record<string, unknown>)[p];
        } else {
          cur = undefined;
          break;
        }
      }
      if (typeof cur === "string") return cur;
      // fallback to English
      let fb: unknown = translations.en;
      for (const p of parts) {
        if (fb && typeof fb === "object" && p in (fb as Record<string, unknown>)) {
          fb = (fb as Record<string, unknown>)[p];
        } else {
          fb = undefined;
          break;
        }
      }
      return typeof fb === "string" ? fb : key;
    };
  }, [lang]);

  const dict = translations[lang];

  const value = useMemo(() => ({ lang, setLang, t, dict }), [lang, t, dict]);

  return (
    <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    // Fallback for tests or outside provider — defaults to English
    const fallbackLang: Language = "en";
    const t = (key: TranslationKey): string => {
      const parts = key.split(".");
      let cur: unknown = translations[fallbackLang];
      for (const p of parts) {
        if (cur && typeof cur === "object" && p in (cur as Record<string, unknown>)) {
          cur = (cur as Record<string, unknown>)[p];
        } else {
          cur = undefined;
          break;
        }
      }
      return typeof cur === "string" ? cur : key;
    };
    return {
      lang: fallbackLang,
      setLang: () => {},
      t,
      dict: translations[fallbackLang],
    };
  }
  return ctx;
}
