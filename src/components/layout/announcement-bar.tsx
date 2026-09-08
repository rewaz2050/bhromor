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
    <div className="bg-forest-950 px-4 py-2 text-center text-[0.72rem] font-medium tracking-wide text-ivory-100">
      <p className="mx-auto max-w-4xl">{text}</p>
    </div>
  );
}
