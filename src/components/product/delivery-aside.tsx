"use client";

import Link from "next/link";
import { useLanguage } from "@/components/i18n/language-provider";
import { IconLeaf } from "@/components/ui/icons";
import { courierEta, isCourierZone } from "@/lib/delivery";
import { formatBdt } from "@/lib/format";
import { useLiveZones } from "@/lib/use-live-zones";
import { useMyZone } from "@/lib/use-my-zone";

/**
 * The delivery card beside the product details (UX plan §4, R11). It used to
 * quote a hard-coded "from ৳30" and a free-delivery rule that does not exist;
 * now it says only what is true for every order — the zone ladder from the
 * live zone table — and, when this device has told us its zone, THAT zone's
 * real charge and clock. Free delivery is per shop/platform and shows in the
 * bag where it is computed, never promised here.
 */
export default function DeliveryAside() {
  const { t, lang } = useLanguage();
  const { activeZones } = useLiveZones();
  const { zoneId } = useMyZone();
  const zone = zoneId ? activeZones.find((z) => z.id === zoneId) ?? null : null;
  const cheapest = activeZones.reduce<number | null>(
    (min, z) => (min === null || z.charge < min ? z.charge : min),
    null,
  );
  const zoneShort = (name: string) => name.split(" — ")[0];
  return (
    <div className="assurance-pill rounded-md bg-forest-900 p-8 text-ivory-100" data-testid="delivery-aside">
      <IconLeaf className="h-6 w-6 text-gold-300" />
      <h2 className={`font-display mt-4 text-xl font-medium ${lang === "bn" ? "font-bengali" : ""}`}>
        {t("product.deliveryAsideTitle")}
      </h2>
      {zone ? (
        <p className="mt-3 text-sm leading-7 text-ivory-100/80" data-testid="delivery-aside-zone">
          {t("product.deliveryAsideZone")
            .replace("{zone}", zoneShort(zone.name))
            .replace("{charge}", formatBdt(zone.charge))
            .replace("{eta}", isCourierZone(zone.id) ? courierEta(lang) : zone.etaLabel)}
        </p>
      ) : (
        <p className="mt-3 text-sm leading-7 text-ivory-100/80">
          {t("product.deliveryAsideBody").replace("{from}", cheapest === null ? "৳60" : formatBdt(cheapest))}
        </p>
      )}
      <ul className="mt-4 space-y-1 rounded-xl bg-white/10 px-4 py-3 text-sm text-ivory-100/85">
        {activeZones.map((z) => (
          <li key={z.id} className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate">{zoneShort(z.name)}</span>
            <span className="shrink-0 tabular-nums">
              <strong className="text-white">{formatBdt(z.charge)}</strong>
              <span className="text-ivory-100/60"> · {isCourierZone(z.id) ? courierEta(lang) : z.etaLabel}</span>
            </span>
          </li>
        ))}
      </ul>
      <Link
        href="/delivery"
        className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold text-gold-300 underline underline-offset-4 hover:text-gold-200"
      >
        {t("product.deliveryAsideMore")}
      </Link>
    </div>
  );
}
