"use client";

/**
 * UX plan §1.2 (R3) — "Area: Borpara ▾" pill.
 *
 * A first visitor's first question is "do you deliver to me?". This pill
 * answers it on the first screen and lets them change it in one tap: a
 * native <select> (works on every phone, no custom popover to trap focus
 * in) dressed as a pill, writing the same remembered zone the home
 * delivery check, the PDP delivery line, the shop browser and checkout
 * read (`useMyZone`). Renders nothing until there are zones to choose.
 */

import { useLanguage } from "@/components/i18n/language-provider";
import { IconChevron, IconMapPin } from "@/components/ui/icons";
import { useLiveZones } from "@/lib/use-live-zones";
import { useMyZone } from "@/lib/use-my-zone";

export default function ZonePill({
  className = "",
  tone = "light",
}: {
  className?: string;
  /** `light` on paper backgrounds (header), `dark` on the forest hero. */
  tone?: "light" | "dark";
}) {
  const { t } = useLanguage();
  const { zoneId, setZoneId } = useMyZone();
  const { activeZones } = useLiveZones();
  if (activeZones.length === 0) return null;
  const zone = zoneId ? activeZones.find((z) => z.id === zoneId) : undefined;
  const dark = tone === "dark";
  return (
    <span
      className={`relative inline-flex min-h-9 max-w-full items-center rounded-full ${
        dark
          ? "bg-ivory-50/10 text-ivory-50 ring-1 ring-ivory-50/30 hover:bg-ivory-50/16"
          : "bg-paper text-forest-900 ring-1 ring-line hover:bg-ivory-100"
      } ${className}`}
      data-testid="zone-pill"
      data-zone={zone?.id ?? ""}
    >
      <IconMapPin
        className={`pointer-events-none absolute left-2.5 h-3.5 w-3.5 ${dark ? "text-gold-200" : "text-forest-700"}`}
      />
      <select
        value={zone?.id ?? ""}
        onChange={(e) => setZoneId(e.target.value || null)}
        aria-label={zone ? t("deliveryLine.change") : t("deliveryLine.choose")}
        title={zone ? t("deliveryLine.change") : t("deliveryLine.choose")}
        className={`h-9 max-w-[12rem] cursor-pointer appearance-none truncate bg-transparent pl-7 pr-7 text-xs font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-forest-500 ${
          dark ? "text-ivory-50" : "text-forest-900"
        }`}
      >
        <option value="">{t("zonePill.choose")}</option>
        {activeZones.map((z) => (
          <option key={z.id} value={z.id}>
            {t("zonePill.prefix")}
            {z.name}
          </option>
        ))}
      </select>
      <IconChevron
        className={`pointer-events-none absolute right-2.5 h-3.5 w-3.5 ${dark ? "text-ivory-100/80" : "text-ink-soft"}`}
      />
    </span>
  );
}
