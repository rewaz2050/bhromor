"use client";

import { useCms } from "@/lib/use-cms";

/**
 * Announcement bar (§31 CMS) — admin copy overlays the shipped default;
 * hidden entirely when disabled from the homepage editor.
 * Polished with subtle gradient, refined typography and gentle sheen.
 */
export default function AnnouncementBar() {
  const { settings } = useCms();
  const { enabled, text } = settings.announcement;
  if (!enabled) return null;
  return (
    <div className="relative overflow-hidden border-b border-gold-300/15 bg-[linear-gradient(90deg,#0c1913_0%,#143122_50%,#0c1913_100%)] px-4 py-2.5 text-center">
      {/* subtle sheen */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.06]"
        style={{
          background:
            "repeating-linear-gradient(90deg, transparent 0 120px, rgba(212,186,131,0.35) 120px 121px)",
        }}
      />
      <p className="relative mx-auto max-w-4xl text-[0.6rem] font-[550] leading-5 tracking-[0.14em] text-ivory-100/90 sm:text-[0.62rem] sm:tracking-[0.16em]">
        <span className="mr-2 hidden h-1 w-1 rounded-full bg-gold-400 align-middle sm:inline-block" aria-hidden="true" />
        {text}
      </p>
    </div>
  );
}
