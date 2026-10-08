"use client";

import { useNow } from "@/lib/use-now";
import { useLanguage } from "@/components/i18n/language-provider";
import { useMyZone } from "@/lib/use-my-zone";
import { usePublicSettings } from "@/lib/use-public-settings";
import { arrivalCue } from "@/lib/arrival";
import { IconClock } from "@/components/ui/icons";

/**
 * The live "order now → by about HH:MM" line. Clock from the shared store
 * (SSR and hydration agree), refreshed every minute while visible; it waits
 * for the shopper's zone, which only this device knows. Renders nothing for
 * the courier zone.
 */
export default function ArrivalCue({
  shopPrepMinutes,
  className = "",
}: {
  shopPrepMinutes?: number;
  className?: string;
}) {
  const { lang } = useLanguage();
  const { zoneId } = useMyZone();
  // The shared clock (flicker pass): the server paints the same minute the
  // browser hydrates with, so the line does not appear, then re-word itself.
  // (It still waits for the shopper's zone, which only this device knows.)
  const now = useNow(60_000);
  const { settings } = usePublicSettings();
  const cue = arrivalCue(
    {
      zoneId,
      shopPrepMinutes,
      lang,
      nightSurchargePaisa: settings.surcharges.night,
    },
    now,
  );
  if (!cue) return null;
  return (
    <p
      data-testid="arrival-cue"
      data-kind={cue.kind}
      className={`inline-flex items-start gap-2 text-xs font-medium text-forest-800 ${className}`}
    >
      <IconClock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold-600" />
      <span>{cue.text}</span>
    </p>
  );
}
