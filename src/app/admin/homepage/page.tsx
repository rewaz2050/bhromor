"use client";

import { useEffect, useState } from "react";
import { useCms } from "@/lib/use-cms";
import {
  SECTION_KEYS,
  SECTION_LABELS,
  type HomeSettings,
  type SectionKey,
} from "@/lib/home-cms";
import { useTransientValue } from "@/lib/use-transient-value";
import { field, hint, label } from "@/components/admin/form-ui";
import { IconCheck } from "@/components/ui/icons";

const clone = (s: HomeSettings): HomeSettings =>
  JSON.parse(JSON.stringify(s)) as HomeSettings;

/** §31 homepage CMS — announcement, hero copy, section visibility. */
export default function AdminHomepagePage() {
  const { settings, save, loading, error } = useCms();
  const [draft, setDraft] = useState<HomeSettings | null>(null);
  const [savedFlash, setSavedFlash] = useTransientValue(false, 1800);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Live rows arrive async — adopt them once, then leave the draft alone.
  useEffect(() => {
    if (!loading && draft === null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot draft adoption
      setDraft(clone(settings));
    }
  }, [loading, settings, draft]);

  const setAnnouncement = (patch: Partial<HomeSettings["announcement"]>) =>
    setDraft((d) => (d ? { ...d, announcement: { ...d.announcement, ...patch } } : d));
  const setHero = (patch: Partial<HomeSettings["hero"]>) =>
    setDraft((d) => (d ? { ...d, hero: { ...d.hero, ...patch } } : d));
  const setSection = (key: SectionKey, value: boolean) =>
    setDraft((d) => (d ? { ...d, sections: { ...d.sections, [key]: value } } : d));

  const persist = async () => {
    if (!draft || saving) return;
    setSaving(true);
    setSaveError(null);
    const ok = await save(draft);
    setSaving(false);
    if (ok) setSavedFlash(true);
    else setSaveError(error ?? "Could not publish — please try again.");
  };

  const blockCls = "rounded-2xl bg-paper p-6 ring-1 ring-line";

  if (draft === null) {
    return (
      <div className="max-w-3xl space-y-6">
        <div>
          <h2 className="font-display text-lg font-medium text-forest-900">
            Homepage
          </h2>
          <p className="mt-1 text-sm text-ink-soft">Loading the published copy…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-medium text-forest-900">
            Homepage
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            Edit the storefront landing copy — Publish updates the live homepage for every visitor.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void persist()}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-full bg-forest-800 px-6 py-2.5 text-sm font-semibold text-ivory-50 transition-colors hover:bg-forest-700 disabled:opacity-60"
          >
            <IconCheck className="h-4 w-4" />
            {saving ? "Publishing…" : savedFlash ? "Saved" : "Publish"}
          </button>
        </div>
      </div>

      {saveError && (
        <p role="alert" className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-rose-200">
          {saveError}
        </p>
      )}

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
            <span className={label}>Subtitle</span>
            <textarea
              className={`${field} min-h-20 resize-y`}
              value={draft.hero.subtitle}
              onChange={(e) => setHero({ subtitle: e.target.value })}
            />
          </label>
          <label className="block sm:col-span-2">
            <span className={label}>CTA label</span>
            <input
              className={field}
              value={draft.hero.primaryLabel}
              onChange={(e) => setHero({ primaryLabel: e.target.value })}
            />
          </label>
          <p className={`${hint} sm:col-span-2`}>
            The single premium CTA leads to the full collection. Campaign rails
            and secondary actions stay on the shop page to keep the hero quiet.
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
