"use client";

import { useState } from "react";
import { useCms } from "@/lib/use-cms";
import {
  SECTION_KEYS,
  SECTION_LABELS,
  type HomeSettings,
  type SectionKey,
} from "@/lib/home-cms";
import { useTransientValue } from "@/lib/use-transient-value";
import { field, hint, label } from "@/components/admin/form-ui";
import { IconCheck, IconReset } from "@/components/ui/icons";

/** §31 homepage CMS skeleton — announcement, hero copy, section visibility. */
export default function AdminHomepagePage() {
  const { settings, save, reset } = useCms();
  const [draft, setDraft] = useState<HomeSettings>(() =>
    JSON.parse(JSON.stringify(settings)) as HomeSettings,
  );
  const [savedFlash, setSavedFlash] = useTransientValue(false, 1800);

  const setAnnouncement = (patch: Partial<HomeSettings["announcement"]>) =>
    setDraft((d) => ({ ...d, announcement: { ...d.announcement, ...patch } }));
  const setHero = (patch: Partial<HomeSettings["hero"]>) =>
    setDraft((d) => ({ ...d, hero: { ...d.hero, ...patch } }));
  const setSection = (key: SectionKey, value: boolean) =>
    setDraft((d) => ({ ...d, sections: { ...d.sections, [key]: value } }));

  const persist = () => {
    save(draft);
    setSavedFlash(true);
  };

  const blockCls = "rounded-2xl bg-paper p-6 ring-1 ring-line";

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-medium text-forest-900">
            Homepage
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            Edit the storefront landing copy — changes appear on the homepage
            immediately (demo store, saved in this browser).
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              if (window.confirm("Restore the shipped homepage copy?")) {
                reset();
                setDraft(JSON.parse(JSON.stringify(settings)));
              }
            }}
            className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium text-ink-soft ring-1 ring-line transition-colors hover:bg-paper hover:text-forest-800"
          >
            <IconReset className="h-4 w-4" /> Reset
          </button>
          <button
            type="button"
            onClick={persist}
            className="inline-flex items-center gap-2 rounded-full bg-forest-800 px-6 py-2.5 text-sm font-semibold text-ivory-50 transition-colors hover:bg-forest-700"
          >
            <IconCheck className="h-4 w-4" />
            {savedFlash ? "Saved" : "Publish"}
          </button>
        </div>
      </div>

      {/* Announcement */}
      <section aria-label="Announcement bar" className={blockCls}>
        <h3 className="text-[0.7rem] font-semibold uppercase tracking-[0.2em] text-ink-soft">
          Announcement bar
        </h3>
        <label className="mt-3 flex items-center gap-2.5 text-sm text-ink">
          <input
            type="checkbox"
            checked={draft.announcement.enabled}
            onChange={(e) => setAnnouncement({ enabled: e.target.checked })}
            className="h-4 w-4 rounded accent-forest-700"
          />
          Show the announcement bar at the very top
        </label>
        <textarea
          className={`${field} mt-3 min-h-16 resize-y`}
          value={draft.announcement.text}
          onChange={(e) => setAnnouncement({ text: e.target.value })}
          placeholder="One short line…"
        />
      </section>

      {/* Hero */}
      <section aria-label="Hero" className={blockCls}>
        <h3 className="text-[0.7rem] font-semibold uppercase tracking-[0.2em] text-ink-soft">
          Hero section
        </h3>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className={label}>Eyebrow</span>
            <input
              className={field}
              value={draft.hero.eyebrow}
              onChange={(e) => setHero({ eyebrow: e.target.value })}
            />
          </label>
          <label className="block">
            <span className={label}>Headline — line 1</span>
            <input
              className={field}
              value={draft.hero.title1}
              onChange={(e) => setHero({ title1: e.target.value })}
            />
          </label>
          <label className="block">
            <span className={label}>Headline — line 2</span>
            <input
              className={field}
              value={draft.hero.title2}
              onChange={(e) => setHero({ title2: e.target.value })}
            />
          </label>
          <label className="block sm:col-span-2">
            <span className={label}>Subtitle (after the প্রশান্তি wordmark)</span>
            <textarea
              className={`${field} min-h-20 resize-y`}
              value={draft.hero.subtitle}
              onChange={(e) => setHero({ subtitle: e.target.value })}
            />
          </label>
          <label className="block">
            <span className={label}>Primary CTA label</span>
            <input
              className={field}
              value={draft.hero.primaryLabel}
              onChange={(e) => setHero({ primaryLabel: e.target.value })}
            />
          </label>
          <label className="block">
            <span className={label}>Secondary CTA label</span>
            <input
              className={field}
              value={draft.hero.secondaryLabel}
              onChange={(e) => setHero({ secondaryLabel: e.target.value })}
            />
          </label>
          <p className={hint}>
            CTA destinations stay fixed (Shop / Our Story) in this skeleton —
            section reordering and image selection arrive with the full CMS.
          </p>
        </div>
      </section>

      {/* Sections */}
      <section aria-label="Section visibility" className={blockCls}>
        <h3 className="text-[0.7rem] font-semibold uppercase tracking-[0.2em] text-ink-soft">
          Section visibility
        </h3>
        <p className={hint}>
          Sections keep their design order; hide the ones that do not fit the
          current campaign (§31).
        </p>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {SECTION_KEYS.map((key) => (
            <li key={key}>
              <label
                className={`flex cursor-pointer items-center justify-between rounded-xl px-4 py-3 text-sm transition-colors ${
                  draft.sections[key]
                    ? "bg-forest-50 text-forest-900"
                    : "bg-ivory-100 text-ink-soft"
                }`}
              >
                {SECTION_LABELS[key]}
                <input
                  type="checkbox"
                  checked={draft.sections[key]}
                  onChange={(e) => setSection(key, e.target.checked)}
                  className="h-4 w-4 rounded accent-forest-700"
                />
              </label>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
