"use client";

import type { ReactNode } from "react";
import { useLanguage } from "./language-provider";

/**
 * Bilingual leaf for server-rendered pages (UX plan §1.4, R9): the page
 * stays a server component and only this text node reads the language.
 * Pass strings or JSX; `bn` falls back to `en` when omitted.
 */
export default function L({ en, bn }: { en: ReactNode; bn?: ReactNode }) {
  const { lang } = useLanguage();
  return <>{lang === "bn" && bn !== undefined ? bn : en}</>;
}
