"use client";

/**
 * Bag footer card: the cash to keep ready at the door (subtotal + the
 * zone's delivery charge + night surcharge when it applies) and the two
 * things the rider will ask for — the amount and the 4-digit PIN.
 */

import { useEffect, useState } from "react";
import { useLanguage } from "@/components/i18n/language-provider";
import { codEstimate } from "@/lib/cod-estimate";
import { formatBdt } from "@/lib/format";
import { useMyZone } from "@/lib/use-my-zone";
import { usePublicSettings } from "@/lib/use-public-settings";
import { IconBanknote } from "@/components/ui/icons";

export default function CodReminder({ subtotal, className = "" }: { subtotal: number; className?: string }) {
  const { t } = useLanguage();
  const { zoneId } = useMyZone();
  // Clock only matters for the night surcharge; re-evaluate each minute.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  // Hooks before any early return — the empty bag renders nothing, but the
  // hook order must not change.
  const { settings } = usePublicSettings();
  if (subtotal <= 0) return null;
  const est = codEstimate(
    {
      subtotal,
      zoneId,
      rates: settings.surcharges,
      courierMinPaisa: settings.courierMinOrderPaisa,
    },
    now,
  );
  const amount = est.exact ? formatBdt(est.min) : `${formatBdt(est.min)}–${formatBdt(est.max)}`;

  return (
    <div
      className={`rounded-2xl bg-paper px-3.5 py-3 text-xs ring-1 ring-line ${className}`}
      data-testid="cod-reminder"
      data-exact={est.exact ? "true" : "false"}
    >
      <p className="flex items-baseline justify-between gap-3">
        <span className="font-semibold text-forest-900"><IconBanknote className="h-4 w-4 shrink-0 text-forest-900" /> {t("bag.codTitle")}</span>
        <strong className="font-display text-base text-forest-900" data-testid="cod-amount">
          {amount}
        </strong>
      </p>
      <p className="mt-1 text-ink-soft">
        {est.exact ? t("bag.codExactHint") : t("bag.codRangeHint")}
        {est.night ? ` · ${t("bag.codNight").replace("{n}", formatBdt(est.night))}` : ""}
      </p>
      <p className="mt-1 text-ink-soft">{t("bag.codPin")}</p>
      {est.belowCourierMinimum ? (
        <p className="mt-1.5 font-semibold text-rose-800" role="status">
          {t("bag.codCourierMin").replace(
            "{min}",
            `৳${Math.round(settings.courierMinOrderPaisa / 100)}`,
          )}
        </p>
      ) : null}
    </div>
  );
}
