"use client";

import { useCms } from "@/lib/use-cms";

/**
 * Announcement bar (§31 CMS) — admin copy overlays the shipped default;
 * hidden entirely when disabled from the homepage editor.
 */
export default function AnnouncementBar() {
  const { settings } = useCms();
  const { enabled, text } = settings.announcement;
  if (!enabled) return null;
  return (
    <div className="border-b border-gold-300/20 bg-forest-950 px-4 py-2.5 text-center text-[0.6rem] font-medium tracking-[0.1em] text-ivory-100">
      <p className="mx-auto max-w-4xl">{text}</p>
    </div>
  );
}
