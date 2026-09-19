"use client";

import { useLanguage } from "@/components/i18n/language-provider";
import type { Language } from "@/lib/translations";

interface Props {
  /**
   * `toggle` is the one-button phone variant (P1 #8): it shows the OTHER
   * language's short label, so a Bangla screen offers "EN" and vice versa —
   * one 44px tap, no pill pair squeezed into a 360px header.
   */
  variant?: "header" | "drawer" | "compact" | "toggle";
  className?: string;
}

export default function LanguageSwitcher({ variant = "header", className = "" }: Props) {
  const { lang, setLang, t } = useLanguage();

  const isDrawer = variant === "drawer";

  const base =
    "inline-flex items-center rounded-full border p-1 transition-colors";

  const headerClasses =
    "border-line/60 bg-ivory-100/80 backdrop-blur-sm";
  const drawerClasses =
    "border-line bg-ivory-50 w-full justify-between p-1.5";

  const btnBase =
    "relative inline-flex items-center justify-center rounded-full text-xs font-semibold tracking-wide transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]";

  const headerBtn = "px-3 py-1.5 min-w-[42px]";
  const drawerBtn = "flex-1 px-4 py-2.5 text-sm";

  const active =
    "bg-forest-900 text-ivory-50 shadow-sm";
  const inactive =
    "text-ink-soft hover:text-forest-900 hover:bg-forest-50/70";

  const handle = (next: Language) => {
    if (next !== lang) setLang(next);
  };

  if (variant === "toggle") {
    const next: Language = lang === "bn" ? "en" : "bn";
    return (
      <button
        type="button"
        onClick={() => handle(next)}
        aria-label={next === "en" ? t("language.switchToEnglish") : t("language.switchToBengali")}
        title={next === "en" ? t("language.switchToEnglish") : t("language.switchToBengali")}
        data-testid="language-toggle"
        className={`header-icon-btn inline-flex h-11 min-w-11 items-center justify-center rounded-full px-2 text-[0.72rem] font-bold tracking-wide text-forest-900 ring-1 ring-line/70 hover:bg-forest-50 ${
          next === "bn" ? "font-bengali" : ""
        } ${className}`}
      >
        {next === "en" ? "EN" : "বাং"}
      </button>
    );
  }

  if (isDrawer) {
    return (
      <div className={`${base} ${drawerClasses} ${className}`} role="group" aria-label="Language">
        <button
          type="button"
          onClick={() => handle("en")}
          aria-pressed={lang === "en"}
          aria-label={t("language.switchToEnglish")}
          className={`${btnBase} ${drawerBtn} ${lang === "en" ? active : inactive}`}
        >
          <span className="flex items-center gap-1.5">
            <span className="text-[0.7rem]">EN</span>
            <span className="hidden text-[0.62rem] font-normal opacity-80 sm:inline">English</span>
          </span>
        </button>
        <button
          type="button"
          onClick={() => handle("bn")}
          aria-pressed={lang === "bn"}
          aria-label={t("language.switchToBengali")}
          className={`${btnBase} ${drawerBtn} ${lang === "bn" ? active : inactive} font-bengali`}
        >
          <span className="flex items-center gap-1.5">
            <span>বাং</span>
            <span className="hidden text-xs font-normal opacity-80 sm:inline">বাংলা</span>
          </span>
        </button>
      </div>
    );
  }

  // header / compact
  return (
    <div
      className={`${base} ${headerClasses} ${className}`}
      role="group"
      aria-label="Language switcher"
    >
      <button
        type="button"
        onClick={() => handle("en")}
        aria-pressed={lang === "en"}
        aria-label={t("language.switchToEnglish")}
        className={`${btnBase} ${headerBtn} ${lang === "en" ? active : inactive}`}
      >
        EN
      </button>
      <button
        type="button"
        onClick={() => handle("bn")}
        aria-pressed={lang === "bn"}
        aria-label={t("language.switchToBengali")}
        className={`${btnBase} ${headerBtn} ${lang === "bn" ? active : inactive} font-bengali`}
      >
        বাং
      </button>
    </div>
  );
}
