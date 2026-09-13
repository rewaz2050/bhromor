"use client";

/**
 * Site-wide flash bar (P0 #3) — one line under the header that says what is
 * running and when it stops, or when the next one opens.
 *
 * Self-hiding: no drop configured, no bar. A promo strip that is always there
 * is decoration; a strip that only appears when money is actually moving is a
 * reason to look now.
 */

import Link from "next/link";
import { usePromos } from "@/lib/use-promos";
import { useLanguage } from "@/components/i18n/language-provider";
import { FlashCountup, FlashTimer } from "./flash-timer";
import { IconArrowRight, IconBolt } from "@/components/ui/icons";

export default function FlashStrip() {
  const { promos, flash } = usePromos();
  const { t } = useLanguage();
  if (!promos.flash.enabled) return null;

  const pct = promos.flash.discountPct;
  const title = promos.flash.title || "Flash Drop";

  return (
    <div
      className="relative z-30 bg-forest-950 text-ivory-50"
      data-testid="flash-strip"
      data-live={flash.active}
    >
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2 text-xs sm:px-6 lg:px-8">
        <span className="flex items-center gap-1.5 font-semibold uppercase tracking-[0.18em] text-gold-300">
          <IconBolt className="h-3.5 w-3.5" />
          {title}
        </span>
        <span className="hidden text-ivory-100/70 sm:inline">
          {t("promo.pctOff").replace("{pct}", String(pct))}
        </span>
        <span className="ml-auto flex items-center gap-3">
          {flash.active && flash.endsAtMs ? (
            <FlashTimer endsAtMs={flash.endsAtMs} className="font-semibold text-gold-200" />
          ) : flash.nextStartsAtMs ? (
            <span className="text-ivory-100/80">
              {t("promo.nextAt").replace(
                "{time}",
                new Intl.DateTimeFormat("en-GB", {
                  hour: "2-digit",
                  minute: "2-digit",
                  timeZone: "Asia/Dhaka",
                }).format(new Date(flash.nextStartsAtMs)),
              )}{" "}
              · <FlashCountup atMs={flash.nextStartsAtMs} />
            </span>
          ) : (
            <span className="text-ivory-100/60">{t("promo.offNow")}</span>
          )}
          <Link
            href="/shop"
            className="hidden items-center gap-1 font-semibold text-gold-200 hover:text-gold-100 sm:inline-flex"
          >
            {t("promo.seeDrop")} <IconArrowRight className="h-3 w-3" />
          </Link>
        </span>
      </div>
      {flash.active && (
        <span
          aria-hidden="true"
          className="block h-0.5 bg-gold-400/80 transition-[width] duration-1000 ease-linear"
          style={{ width: `${Math.round(flash.progress * 100)}%` }}
        />
      )}
    </div>
  );
}
