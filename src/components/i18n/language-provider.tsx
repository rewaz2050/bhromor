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

const STORAGE_KEY = "prosanti-lang";

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Language>("en");
  const [mounted, setMounted] = useState(false);

  // Hydration-safe: read stored preference after mount
  useEffect(() => {
    setMounted(true);
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY) as Language | null;
      if (stored === "en" || stored === "bn") {
        setLangState(stored);
        document.documentElement.lang = stored === "bn" ? "bn" : "en";
      }
    } catch {
      // ignore storage errors
    }
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
