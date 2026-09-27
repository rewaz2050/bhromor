"use client";

import { useHomeSettings } from "@/lib/use-home-settings";

/**
 * Announcement bar (§31 CMS) — admin copy overlays the shipped default;
 * hidden entirely when disabled from the homepage editor.
 *
 * Always one line: on a phone the old two-line wrap pushed the shelf down
 * by a full header's height before the shopper had seen a product. The
 * full text stays in `title` for anyone who wants to read a clipped tail.
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
    <div className="relative overflow-hidden border-b border-gold-300/15 bg-[linear-gradient(90deg,#0c1913_0%,#143122_50%,#0c1913_100%)] px-4 py-2 text-center sm:py-2.5">
      {/* subtle sheen */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.06]"
        style={{
          background:
            "repeating-linear-gradient(90deg, transparent 0 120px, rgba(212,186,131,0.35) 120px 121px)",
        }}
      />
      <p
        title={text}
        lang={isBengali ? "bn" : "en"}
        className={`relative mx-auto max-w-4xl truncate font-[550] leading-5 text-ivory-100/90 ${
          isBengali
            ? "font-bengali text-[0.74rem] sm:text-[0.78rem]"
            : "text-[0.6rem] tracking-[0.05em] sm:text-[0.62rem] sm:tracking-[0.14em]"
        }`}
      >
        <span className="mr-2 hidden h-1 w-1 rounded-full bg-gold-400 align-middle sm:inline-block" aria-hidden="true" />
        {text}
      </p>
    </div>
  );
}
