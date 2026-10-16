"use client";

import { useState } from "react";
import Link from "next/link";
import { useLiveZones } from "@/lib/use-live-zones";
import { useMyZone } from "@/lib/use-my-zone";
import { formatBdt } from "@/lib/format";
import { courierEta, isCourierZone } from "@/lib/delivery";
import { IconTruck } from "@/components/ui/icons";
import { useLanguage } from "@/components/i18n/language-provider";

export default function DeliveryChecker() {
  const { t, lang } = useLanguage();
  const { activeZones } = useLiveZones();
  const { zoneId: myZoneId, setZoneId } = useMyZone();
  const [area, setArea] = useState("");
  const [checked, setChecked] = useState(false);
  const zone = activeZones.find(
    (z) =>
      z.areas.some(
        (a) => a.toLocaleLowerCase() === area.trim().toLocaleLowerCase(),
      ) || z.name.toLocaleLowerCase() === area.trim().toLocaleLowerCase(),
  );
  return (
    <section
      aria-labelledby="delivery-check-title"
      className="border-b border-line bg-ivory-100"
    >
      <div className="mx-auto grid max-w-7xl items-center gap-6 px-6 py-8 lg:grid-cols-2 lg:px-8">
        <div className="flex items-start gap-4">
          <IconTruck className="mt-1 h-6 w-6 shrink-0 text-gold-600" />
          <div>
            <h2
              id="delivery-check-title"
              className="font-display text-2xl text-forest-900"
            >
              {t("deliveryChecker.title")}
            </h2>
            <p className="mt-2 text-sm text-ink-soft">
              {t("deliveryChecker.intro")}
            </p>
          </div>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setChecked(true);
          }}
        >
          <label htmlFor="delivery-area" className="sr-only">
            {t("deliveryChecker.label")}
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              required
              id="delivery-area"
              list="delivery-areas"
              value={area}
              onChange={(e) => {
                setArea(e.target.value);
                setChecked(false);
              }}
              placeholder={t("deliveryChecker.placeholder")}
              className="h-12 min-w-0 flex-1 border border-line bg-paper px-4 text-base"
            />
            <datalist id="delivery-areas">
              {activeZones
                .flatMap((z) => z.areas)
                .map((a) => (
                  <option key={a} value={a} />
                ))}
            </datalist>
            <button className="editorial-button justify-center bg-forest-800 text-white">
              {t("deliveryChecker.submit")}
            </button>
          </div>
          <div role="status" className="mt-3 text-sm text-forest-800">
            {checked &&
              (zone ? (
                <>
                  {t("deliveryChecker.available")
                    .replace(
                      "{eta}",
                      isCourierZone(zone.id) ? courierEta(lang) : zone.etaLabel,
                    )
                    .replace("{charge}", formatBdt(zone.charge))}{" "}
                  {myZoneId === zone.id ? (
                    <span className="font-medium">
                      {t("deliveryChecker.showingShops").replace("{zone}", zone.name)}
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setZoneId(zone.id)}
                      className="font-semibold underline underline-offset-2 hover:text-forest-900"
                    >
                      {t("deliveryChecker.shopFor").replace("{zone}", zone.name)}
                    </button>
                  )}
                </>
              ) : (
                <>
                  {t("deliveryChecker.notConfirmedBefore")}{" "}
                  <Link href="/contact" className="underline">
                    {t("deliveryChecker.contactUs")}
                  </Link>{" "}
                  {t("deliveryChecker.notConfirmedAfter")}
                </>
              ))}
          </div>
        </form>
      </div>
    </section>
  );
}
