"use client";

/**
 * Campaign strip (P2 #20) — one line under the flash bar while a seasonal
 * campaign is armed. Teaser days count up to the opening; live days count
 * down to close. Like the flash strip it renders nothing when nothing runs:
 * the state comes from the same /api/promo poll that flips exactly at the
 * window boundary, so a tab left open across midnight updates without reload.
 */

import Link from "next/link";
import { useCampaign } from "@/lib/use-promos";
import { useLanguage } from "@/components/i18n/language-provider";
import { FlashCountup, FlashTimer } from "./flash-timer";
import { IconArrowRight, IconGift } from "@/components/ui/icons";

export default function CampaignStrip() {
  const { campaign } = useCampaign();
  const { lang } = useLanguage();
  if (campaign.state !== "live" && campaign.state !== "teaser") return null;

  const title =
    (lang === "bn" && campaign.titleBn) || campaign.title || "Seasonal drop";

  return (
    <div
      className="relative z-20 bg-gold-300/10 text-ink-soft [border-block:1px_solid_var(--color-line)]"
      data-testid="campaign-strip"
      data-state={campaign.state}
    >
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2 text-xs sm:px-6 lg:px-8">
        <span className="flex items-center gap-1.5 font-semibold uppercase tracking-[0.18em] text-forest-800">
          <IconGift className="h-3.5 w-3.5" />
          {title}
        </span>
        <span className="ml-auto flex items-center gap-3">
          {campaign.state === "live" && campaign.endsAtMs ? (
            <FlashTimer endsAtMs={campaign.endsAtMs} className="font-semibold text-forest-800" />
          ) : campaign.startsAtMs ? (
            <span>
              {lang === "bn" ? "শুরু হতে" : "Opens in"}{" "}
              <FlashCountup atMs={campaign.startsAtMs} />
            </span>
          ) : null}
          <Link
            href="/campaign"
            className="inline-flex items-center gap-1 font-semibold text-forest-800 underline-offset-4 hover:underline"
          >
            {lang === "bn" ? "দেখুন" : "See it"} <IconArrowRight className="h-3 w-3" />
          </Link>
        </span>
      </div>
    </div>
  );
}
