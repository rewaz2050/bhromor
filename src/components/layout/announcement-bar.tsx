"use client";

import { useHomeSettings } from "@/lib/use-home-settings";

/**
 * Announcement bar (§31 CMS) — admin copy overlays the shipped default;
 * hidden entirely when disabled from the homepage editor.
 *
 * Compact by default; native disclosure lets touch and keyboard users read
 * the full announcement without relying on a hover-only tooltip.
 */
export default function AnnouncementBar() {
  const { settings } = useHomeSettings();
  const { enabled, text } = settings.announcement;
  if (!enabled) return null;
  // The bar's tracked small caps suit Latin copy; Bengali copy must not be
  // letter-spaced (globals.css relaxes tracking under :lang(bn)). Tag the
  // language from the CMS text itself so either reads right in either UI.
  const isBengali = /[\u0980-\u09FF]/.test(text);
  return (
    <details className="group border-b border-gold-300/15 bg-forest-950 px-4 py-2 text-center sm:py-2.5">
      <summary className="mx-auto flex min-h-7 max-w-4xl cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden">
      <span
        title={text}
        lang={isBengali ? "bn" : "en"}
        className={`relative block min-w-0 flex-1 truncate group-open:whitespace-normal font-[550] leading-5 text-ivory-100/90 ${
          isBengali
            ? "font-bengali text-[0.74rem] sm:text-[0.78rem]"
            : "text-xs tracking-normal"
        }`}
      >
        <span className="mr-2 hidden h-1 w-1 rounded-full bg-gold-400 align-middle sm:inline-block" aria-hidden="true" />
        {text}
      </span>
      <span aria-hidden="true" className="text-ivory-100/80 transition-transform group-open:rotate-180">⌄</span>
      </summary>
    </details>
  );
}
