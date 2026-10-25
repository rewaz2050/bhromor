"use client";

import { useLanguage } from "@/components/i18n/language-provider";
import { bnDigits } from "@/lib/arrival";
import { courierEta, isCourierZone } from "@/lib/delivery";
import { useLiveZones } from "@/lib/use-live-zones";
import { useMyZone } from "@/lib/use-my-zone";

/** One area-aware delivery message. Never infer an arrival time without an area. */
export default function DeliveryEstimate() {
  const { lang } = useLanguage();
  const { activeZones } = useLiveZones();
  const { zoneId } = useMyZone();
  const zone = activeZones.find((item) => item.id === zoneId);
  if (!zone) {
    return <span>{lang === "bn" ? "এলাকা বেছে ডেলিভারির সময় দেখুন" : "Choose your area for a delivery estimate"}</span>;
  }
  const eta = isCourierZone(zone.id) ? courierEta(lang) : zone.etaLabel;
  return (
    <span>
      {zone.name.split(" — ")[0]} · {lang === "bn" ? bnDigits(eta) : eta}
    </span>
  );
}
