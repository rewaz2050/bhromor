"use client";

/**
 * Campaign-aware hero (UX plan §2, R9). The compact hero keeps its shape;
 * only while something is genuinely on does the copy change:
 *   · campaign LIVE   → campaign title/subtitle, "ends in" countdown, CTA /campaign
 *   · campaign TEASER → "opens in" count-up, CTA /campaign (early access)
 *   · flash drop LIVE (no campaign) → "−20% · ends in 02:14:09", CTA /offers
 * Nothing armed → null, and the hero renders exactly as before. Every fact
 * here comes from the armed settings document — never a placeholder date.
 */

import Link from "next/link";
import { useLanguage } from "@/components/i18n/language-provider";
import { useCampaign, usePromos } from "@/lib/use-promos";
import { bnDigits } from "@/lib/arrival";
import { FlashCountup, FlashTimer } from "@/components/promo/flash-timer";
import { IconArrowRight, IconBolt } from "@/components/ui/icons";

export interface HeroCampaignCopy {
  eyebrow: string;
  title: string;
  subtitle: string;
  ctaLabel: string;
  href: string;
  /** Countdown target (ends-at for live, starts-at for teaser); null = no clock. */
  clock: { kind: "down" | "up"; atMs: number } | null;
  kind: "campaign-live" | "campaign-teaser" | "flash";
}

/** Pure: what the hero should say, or null for an ordinary day. */
export const heroCampaignCopy = (
  campaign: { state: string; title: string; titleBn: string; subtitle: string; subtitleBn: string; startsAtMs: number | null; endsAtMs: number | null },
  flash: { active: boolean; endsAtMs: number | null },
  flashCfg: { title?: string; discountPct?: number } | null,
  lang: "en" | "bn",
  t: (k: "home.heroCampaignLive" | "home.heroCampaignSoon" | "home.heroCampaignCta" | "home.heroCampaignSoonCta" | "home.heroFlashEyebrow" | "home.heroFlashTitle" | "home.heroFlashSub" | "home.heroFlashCta") => string,
): HeroCampaignCopy | null => {
  const bn = lang === "bn";
  if (campaign.state === "live") {
    return {
      kind: "campaign-live",
      eyebrow: t("home.heroCampaignLive"),
      title: (bn ? campaign.titleBn : campaign.title) || campaign.title,
      subtitle: (bn ? campaign.subtitleBn : campaign.subtitle) || campaign.subtitle,
      ctaLabel: t("home.heroCampaignCta"),
      href: "/campaign",
      clock: campaign.endsAtMs ? { kind: "down", atMs: campaign.endsAtMs } : null,
    };
  }
  if (campaign.state === "teaser") {
    return {
      kind: "campaign-teaser",
      eyebrow: t("home.heroCampaignSoon"),
      title: (bn ? campaign.titleBn : campaign.title) || campaign.title,
      subtitle: (bn ? campaign.subtitleBn : campaign.subtitle) || campaign.subtitle,
      ctaLabel: t("home.heroCampaignSoonCta"),
      href: "/campaign",
      clock: campaign.startsAtMs ? { kind: "up", atMs: campaign.startsAtMs } : null,
    };
  }
  if (flash.active && flash.endsAtMs) {
    const pct = flashCfg?.discountPct ?? 0;
    const pctLabel = bn ? bnDigits(String(pct)) : String(pct);
    return {
      kind: "flash",
      eyebrow: t("home.heroFlashEyebrow"),
      title: (flashCfg?.title?.trim() || t("home.heroFlashTitle")).replace("{pct}", pctLabel),
      subtitle: t("home.heroFlashSub").replace("{pct}", pctLabel),
      ctaLabel: t("home.heroFlashCta"),
      href: "/offers",
      clock: { kind: "down", atMs: flash.endsAtMs },
    };
  }
  return null;
};

/** The countdown chip + CTA row the hero renders under campaign copy. */
export default function HeroCampaignBand({ copy }: { copy: HeroCampaignCopy }) {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2" data-testid="hero-campaign" data-kind={copy.kind}>
      <Link href={copy.href} className="editorial-button bg-gold-200 text-forest-950 hover:bg-ivory-100">
        <IconBolt className="h-4 w-4" />
        {copy.ctaLabel}
        <IconArrowRight className="h-4 w-4" />
      </Link>
      {copy.clock && (
        <span className="inline-flex min-h-11 items-center gap-2 rounded-full bg-ivory-50/10 px-4 text-xs font-semibold tabular-nums text-ivory-50 ring-1 ring-ivory-50/20">
          {copy.clock.kind === "down" ? (
            <FlashTimer endsAtMs={copy.clock.atMs} />
          ) : (
            <FlashCountup atMs={copy.clock.atMs} />
          )}
        </span>
      )}
    </div>
  );
}

/** Hook used by the hero: the campaign copy for right now, or null. */
export function useHeroCampaign(): HeroCampaignCopy | null {
  const { lang, t } = useLanguage();
  const { campaign } = useCampaign();
  const { promos, flash } = usePromos();
  return heroCampaignCopy(campaign, flash, promos.flash.enabled ? promos.flash : null, lang, t);
}
