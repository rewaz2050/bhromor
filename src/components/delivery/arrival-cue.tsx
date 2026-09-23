"use client";

import { useEffect, useState } from "react";
import { useLanguage } from "@/components/i18n/language-provider";
import { useMyZone } from "@/lib/use-my-zone";
import { usePublicSettings } from "@/lib/use-public-settings";
import { arrivalCue } from "@/lib/arrival";
import { IconClock } from "@/components/ui/icons";

/**
 * The live "order now → by about HH:MM" line. Computed on the client after
 * mount (the server does not know the shopper's clock or zone) and refreshed
 * every minute while visible. Renders nothing for the courier zone.
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
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- clock is browser-only
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  // Hooks before the clock gate — SSR renders nothing, but the order never changes.
  const { settings } = usePublicSettings();
  if (now === null) return null;
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
