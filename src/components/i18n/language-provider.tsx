"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { translations, type Language, type TranslationKey } from "@/lib/translations";

type LanguageContextValue = {
  lang: Language;
  setLang: (lang: Language) => void;
  t: (key: TranslationKey) => string;
  dict: (typeof translations)[Language];
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

export const LANGUAGE_STORAGE_KEY = "prosanti-lang";
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
  const [mounted, setMounted] = useState(false);

  // Hydration-safe: read stored preference after mount. A device that never
  // chose stays on `initialLang`; one that did gets its choice back.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage hydration must happen post-mount
    setMounted(true);
    try {
      const stored = readStoredLanguage();
      if (stored) setLangState(stored);
      document.documentElement.lang = (stored ?? initialLang) === "bn" ? "bn" : "en";
    } catch {
      // ignore storage errors
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initialLang is a mount-time default
  }, []);

  useEffect(() => {
    if (!mounted) return;
    try {
      document.documentElement.lang = lang === "bn" ? "bn" : "en";
      window.localStorage.setItem(STORAGE_KEY, lang);
      // also set cookie for potential SSR reading
      document.cookie = `prosanti-lang=${lang}; path=/; max-age=31536000; samesite=lax`;
    } catch {
      // ignore
    }
  }, [lang, mounted]);

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
