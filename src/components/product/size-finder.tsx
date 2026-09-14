"use client";

/**
 * Size Finder (P0 #1) — height + weight + how you like the fit, answered with
 * the size this item actually sells.
 *
 * The claim is deliberately small: it is an estimate from body numbers, and the
 * disclaimer says so, because the catalog has no verified measurement chart yet.
 * The saved body is only ever stored on this device (it is a body, not an
 * order), and it also feeds "add the set" so a bundle arrives in sizes somebody
 * can wear.
 */

import { useEffect, useMemo, useState } from "react";
import type { TranslationKey } from "@/lib/translations";
import type { Product } from "@/lib/catalog";
import { suggestSize, type SizeProfile, type SizeVerdict } from "@/lib/size-finder";
import { useSizeProfile } from "@/lib/use-size-profile";
import Drawer from "@/components/ui/drawer";
import { IconCheck, IconClose, IconRuler } from "@/components/ui/icons";
import { useLanguage } from "@/components/i18n/language-provider";

const VERDICT_STYLE: Record<SizeVerdict, string> = {
  best: "bg-forest-100 text-forest-900 ring-forest-300",
  snug: "bg-amber-50 text-amber-900 ring-amber-200",
  roomy: "bg-sky-50 text-sky-900 ring-sky-200",
  skip: "bg-ivory-200 text-ink-soft ring-line",
};

export const verdictLabel = (
  verdict: SizeVerdict,
  t: (key: TranslationKey) => string,
): string =>
  verdict === "best"
    ? t("sizeFinder.verdictBest")
    : verdict === "snug"
      ? t("sizeFinder.verdictSnug")
      : verdict === "roomy"
        ? t("sizeFinder.verdictRoomy")
        : t("sizeFinder.verdictSkip");

export function useSizeSuggestion(product: Product) {
  const { profile } = useSizeProfile();
  const suggestion = useMemo(() => suggestSize(product, profile), [product, profile]);
  return { profile, suggestion };
}

export default function SizeFinder({
  product,
  onPick,
  autoOpenKey,
}: {
  product: Product;
  /** Called with the recommended size so the picker can select it. */
  onPick?: (size: string) => void;
  /**
   * Bump this number (from the parent) to open the drawer — used by the
   * stylist chat, which closes itself first so dialogs never stack.
   */
  autoOpenKey?: number;
}) {
  const { t } = useLanguage();
  const { profile, save, clear } = useSizeProfile();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (autoOpenKey && autoOpenKey > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- deliberate signal from the stylist chat (its dialog is already closed)
      setOpen(true);
    }
  }, [autoOpenKey]);
  const [height, setHeight] = useState(profile ? String(profile.heightCm) : "");
  const [weight, setWeight] = useState(profile ? String(profile.weightKg) : "");
  const [fit, setFit] = useState<SizeProfile["fit"]>(profile?.fit ?? "regular");
  const [chest, setChest] = useState(profile?.chestCm ? String(profile.chestCm) : "");
  const [waist, setWaist] = useState(profile?.waistCm ? String(profile.waistCm) : "");
  const [error, setError] = useState("");
  const [remember, setRemember] = useState(true);

  const result = useMemo(() => {
    const draft: SizeProfile = {
      heightCm: Number(height),
      weightKg: Number(weight),
      fit,
      ...(chest.trim() !== "" ? { chestCm: Number(chest) } : {}),
      ...(waist.trim() !== "" ? { waistCm: Number(waist) } : {}),
    };
    return suggestSize(product, Number.isFinite(draft.heightCm) && Number.isFinite(draft.weightKg) ? draft : null);
  }, [product, height, weight, fit, chest, waist]);

  const submit = () => {
    setError("");
    const draft: SizeProfile = {
      heightCm: Number(height),
      weightKg: Number(weight),
      fit,
      ...(chest.trim() !== "" ? { chestCm: Number(chest) } : {}),
      ...(waist.trim() !== "" ? { waistCm: Number(waist) } : {}),
    };
    if (!Number.isFinite(draft.heightCm) || !Number.isFinite(draft.weightKg)) {
      setError(t("sizeFinder.intro"));
      return;
    }
    if (remember && !save(draft)) {
      setError(t("sizeFinder.intro"));
      return;
    }
    if (result.recommended && onPick) onPick(result.recommended);
    if (!remember) setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="inline-flex min-h-11 items-center gap-1.5 text-xs font-medium text-forest-800 underline underline-offset-4"
      >
        <IconRuler className="h-3.5 w-3.5" />
        {t("sizeFinder.title")}
      </button>

      {profile && result.recommended ? (
        <button
          type="button"
          onClick={() => onPick?.(result.recommended!)}
          className="ml-2 inline-flex min-h-11 items-center gap-1 rounded-full bg-forest-100 px-3 text-xs font-semibold text-forest-900 ring-1 ring-forest-300 transition-colors hover:bg-forest-200"
          data-testid="size-finder-chip"
        >
          <IconCheck className="h-3.5 w-3.5" />
          {t("sizeFinder.yourSize").replace("{size}", result.recommended)}
        </button>
      ) : null}

      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        label={t("sizeFinder.title")}
        side="right"
        panelClassName="!w-full !max-w-lg p-6 sm:p-8"
      >
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-3xl text-forest-900">{t("sizeFinder.title")}</h2>
            <p className="mt-2 text-sm leading-7 text-ink-soft">{t("sizeFinder.intro")}</p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label={t("header.closeMenu")}
            className="flex h-11 w-11 shrink-0 items-center justify-center"
          >
            <IconClose />
          </button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-soft">
              {t("sizeFinder.height")}
            </span>
            <input
              type="number"
              inputMode="numeric"
              min={120}
              max={220}
              value={height}
              onChange={(e) => setHeight(e.target.value)}
              className="mt-1.5 h-12 w-full rounded-xl bg-paper px-4 text-sm ring-1 ring-line focus:ring-2 focus:ring-forest-500"
            />
          </label>
          <label className="block text-sm">
            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-soft">
              {t("sizeFinder.weight")}
            </span>
            <input
              type="number"
              inputMode="decimal"
              min={25}
              max={200}
              step="0.5"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              className="mt-1.5 h-12 w-full rounded-xl bg-paper px-4 text-sm ring-1 ring-line focus:ring-2 focus:ring-forest-500"
            />
          </label>
        </div>

        <fieldset className="mt-5">
          <legend className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-soft">
            {t("sizeFinder.fit")}
          </legend>
          <div className="mt-2 flex gap-2">
            {(["slim", "regular", "relaxed"] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFit(f)}
                aria-pressed={fit === f}
                className={`h-11 flex-1 rounded-xl px-3 text-sm transition-colors ${
                  fit === f
                    ? "bg-forest-800 font-semibold text-ivory-50"
                    : "bg-paper text-ink-soft ring-1 ring-line hover:ring-forest-400"
                }`}
              >
                {f === "slim" ? t("sizeFinder.fitSlim") : f === "regular" ? t("sizeFinder.fitRegular") : t("sizeFinder.fitRelaxed")}
              </button>
            ))}
          </div>
        </fieldset>

        <details className="mt-5 rounded-xl bg-ivory-100 p-4">
          <summary className="cursor-pointer text-sm font-medium text-forest-800">
            {t("sizeFinder.measured")}
          </summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="text-xs text-ink-soft">{t("sizeFinder.chest")}</span>
              <input
                type="number"
                inputMode="decimal"
                min={60}
                max={180}
                value={chest}
                onChange={(e) => setChest(e.target.value)}
                className="mt-1.5 h-11 w-full rounded-xl bg-paper px-3 text-sm ring-1 ring-line focus:ring-2 focus:ring-forest-500"
              />
            </label>
            <label className="block text-sm">
              <span className="text-xs text-ink-soft">{t("sizeFinder.waist")}</span>
              <input
                type="number"
                inputMode="decimal"
                min={50}
                max={170}
                value={waist}
                onChange={(e) => setWaist(e.target.value)}
                className="mt-1.5 h-11 w-full rounded-xl bg-paper px-3 text-sm ring-1 ring-line focus:ring-2 focus:ring-forest-500"
              />
            </label>
          </div>
        </details>

        {result.recommended || result.closest ? (
          <div className="mt-6 rounded-xl border border-forest-300 bg-forest-50 p-5">
            <p className="font-display text-2xl text-forest-900">
              {result.recommended
                ? t("sizeFinder.recommended").replace("{size}", result.recommended)
                : t("sizeFinder.closest").replace("{size}", result.closest ?? "")}
            </p>
            {result.recommended ? (
              <p className="mt-1 text-xs font-semibold uppercase tracking-[0.14em] text-gold-700">
                {t("sizeFinder.match").replace("{confidence}", String(result.confidence))}
              </p>
            ) : null}
            <ul className="mt-4 flex flex-wrap gap-2">
              {result.scores.map((score) => (
                <li
                  key={score.size}
                  className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ${VERDICT_STYLE[score.verdict]}`}
                >
                  {score.size} · {verdictLabel(score.verdict, t)}
                </li>
              ))}
            </ul>
            <p className="mt-4 text-xs leading-6 text-ink-soft">{result.note}</p>
          </div>
        ) : null}

        {error ? (
          <p role="alert" className="mt-4 text-sm text-rose-700">
            {error}
          </p>
        ) : null}

        <label className="mt-5 flex items-center gap-2 text-sm text-ink-soft">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            className="h-4 w-4 accent-[var(--forest-700,#1c4a3b)]"
          />
          {t("sizeFinder.remember")}
        </label>

        <button
          type="button"
          onClick={submit}
          className="mt-5 h-12 w-full rounded-sm bg-forest-800 text-sm font-semibold text-ivory-50 transition-colors hover:bg-forest-700"
        >
          {t("sizeFinder.suggest")}
        </button>

        {profile ? (
          <button
            type="button"
            onClick={() => {
              clear();
              setHeight("");
              setWeight("");
              setChest("");
              setWaist("");
            }}
            className="mt-3 w-full text-center text-xs text-ink-soft underline underline-offset-4"
          >
            {t("sizeFinder.clear")} · {t("sizeFinder.saved")}
          </button>
        ) : null}

        <p className="mt-6 border-l-2 border-gold-400 bg-ivory-100 p-4 text-xs leading-6 text-ink-soft">
          {t("sizeFinder.disclaimer")}
        </p>
      </Drawer>
    </>
  );
}
