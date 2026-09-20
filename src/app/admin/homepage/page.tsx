"use client";

import { useEffect, useState } from "react";
import { useCms } from "@/lib/use-cms";
import { useCoupons } from "@/lib/use-coupons";
import { normalizeCode } from "@/lib/coupons";
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
  // Only to warn when the advertised code is not an active coupon — the
  // homepage never creates or applies discounts itself.
  const { coupons, live: couponsLive, loading: couponsLoading } = useCoupons();
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
  const setPromo = (patch: Partial<HomeSettings["promo"]>) =>
    setDraft((d) => (d ? { ...d, promo: { ...d.promo, ...patch } } : d));
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

      {/* Public promo code */}
      <section aria-label="Public promo code" className={blockCls}>
        <h3 className="text-[0.7rem] font-semibold uppercase tracking-[0.2em] text-ink-soft">
          Public promo code
        </h3>
        <p className={hint}>
          Advertises one coupon at the top of the homepage offers block with a
          tap-to-copy code. It does not discount anything by itself — create the
          code under Coupons first; checkout validates it there.
        </p>
        <label className="mt-3 flex items-center gap-2.5 text-sm text-ink">
          <input
            type="checkbox"
            checked={draft.promo.enabled}
            onChange={(e) => setPromo({ enabled: e.target.checked })}
            className="h-4 w-4 rounded accent-forest-700"
            data-testid="promo-enabled"
          />
          Show the promo code card on the homepage
        </label>
        <div className="mt-3 grid gap-4 sm:grid-cols-3">
          <label className="block">
            <span className={label}>Code</span>
            <input
              className={`${field} font-mono uppercase`}
              value={draft.promo.code}
              maxLength={24}
              onChange={(e) => setPromo({ code: normalizeCode(e.target.value) })}
              placeholder="WELCOME10"
              data-testid="promo-code"
            />
          </label>
          <label className="block sm:col-span-2">
            <span className={label}>One line — what the code gives</span>
            <input
              className={field}
              value={draft.promo.text}
              maxLength={140}
              onChange={(e) => setPromo({ text: e.target.value })}
              placeholder="10% off your first order · min ৳999"
            />
          </label>
        </div>
        {draft.promo.enabled &&
        draft.promo.code.trim() !== "" &&
        couponsLive &&
        !couponsLoading ? (
          coupons.some(
            (c) => c.active && c.code === normalizeCode(draft.promo.code),
          ) ? (
            <p className="mt-3 text-xs text-forest-700" data-testid="promo-code-ok">
              ✓ Active coupon found — shoppers can redeem it at checkout.
            </p>
          ) : (
            <p role="alert" className="mt-3 text-xs text-rose-700" data-testid="promo-code-missing">
              No active coupon with this code exists yet — shoppers would see
              &ldquo;not active&rdquo; at checkout. Create it under Coupons before
              publishing.
            </p>
          )
        ) : null}
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
