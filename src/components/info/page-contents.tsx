"use client";

import { useLanguage } from "@/components/i18n/language-provider";

export type ContentsItem = { id: string; en: string; bn: string };

/** Plain anchor links: no scroll listener, animation or extra navigation state. */
export default function PageContents({ items }: { items: ContentsItem[] }) {
  const { lang } = useLanguage();
  return (
    <nav aria-label={lang === "bn" ? "এই পাতায়" : "On this page"} className="mt-8 rounded-2xl border border-line bg-paper p-4 sm:p-5">
      <p className="text-sm font-semibold text-forest-900">
        {lang === "bn" ? "এই পাতায়" : "On this page"}
      </p>
      <ul className="mt-2 grid gap-x-5 sm:grid-cols-2">
        {items.map(item => (
          <li key={item.id}>
            <a href={`#${item.id}`} className="flex min-h-11 items-center rounded-md py-2 text-sm text-forest-800 underline decoration-forest-300 underline-offset-4 hover:decoration-forest-800">
              {lang === "bn" ? item.bn : item.en}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
