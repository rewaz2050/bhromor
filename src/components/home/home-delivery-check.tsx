"use client";

/**
 * Home trust pills + "do we deliver to your para?" (UX audit 2026-09-18,
 * P2 #20).
 *
 * The first question a Sunamganj shopper has is not "which panjabi" but
 * "does this shop even come to my para, and for how much?". The answer used
 * to live three pages away (/delivery) and in the checkout. Since Batch K
 * this strip closes the homepage (under the whole shelf, above the service
 * promises): four facts that are true for every order, and a one-field
 * check that quotes the zone's real charge and time from the same zone
 * table the checkout prices from. A match also sets the "deliver to" zone
 * so /shop opens already scoped.
 */

import { useId, useState } from "react";
import Link from "next/link";
import { useLanguage } from "@/components/i18n/language-provider";
import { IconBanknote, IconMapPin, IconRefresh, IconShield, IconTruck } from "@/components/ui/icons";
import { courierEta, isCourierZone } from "@/lib/delivery";
import { formatBdt } from "@/lib/format";
import { useLiveZones } from "@/lib/use-live-zones";
import { useMyZone } from "@/lib/use-my-zone";
import type { DeliveryZone } from "@/lib/catalog";

/** Same tolerant match the checkout's para ladder uses: exact, then contains. */
export const findZoneForPara = (zones: DeliveryZone[], input: string): DeliveryZone | null => {
  const clean = input.trim().toLocaleLowerCase();
  if (!clean) return null;
  for (const zone of zones) {
    if (zone.areas.some((a) => a.toLocaleLowerCase() === clean)) return zone;
  }
  for (const zone of zones) {
    if (
      zone.areas.some((a) => {
        const area = a.toLocaleLowerCase();
        return area.includes(clean) || clean.includes(area);
      })
    ) {
      return zone;
    }
  }
  return null;
};

export default function HomeDeliveryCheck() {
  const { t, lang } = useLanguage();
  const { activeZones } = useLiveZones();
  const { setZoneId } = useMyZone();
  const [para, setPara] = useState("");
  const [checked, setChecked] = useState<null | { zone: DeliveryZone | null }>(null);
  const inputId = useId();
  const listId = `${inputId}-paras`;

  const pills = [
    { icon: <IconBanknote className="h-4 w-4" />, label: t("trust.pillCod"), href: "/faq" },
    { icon: <IconTruck className="h-4 w-4" />, label: t("trust.pillDelivery"), href: "/delivery" },
    { icon: <IconShield className="h-4 w-4" />, label: t("trust.pillPin"), href: "/faq" },
    { icon: <IconRefresh className="h-4 w-4" />, label: t("trust.pillReturns"), href: "/returns" },
  ];

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const zone = findZoneForPara(activeZones, para);
    setChecked({ zone });
    if (zone) setZoneId(zone.id);
  };

  const zone = checked?.zone ?? null;
  const zoneShort = (z: DeliveryZone) => z.name.split(" — ")[0];

  return (
    <section
      aria-label={lang === "bn" ? "ডেলিভারি ও আস্থা" : "Delivery and trust"}
      className="border-b border-line bg-ivory-100"
      data-testid="home-delivery-check"
    >
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {/* Trust pills — every one links to the page that proves it. */}
        <ul className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0" data-testid="trust-pills">
          {pills.map((pill) => (
            <li key={pill.label} className="shrink-0 snap-start">
              <Link
                href={pill.href}
                className="inline-flex min-h-10 items-center gap-2 rounded-full bg-paper px-3.5 text-xs font-semibold text-forest-900 ring-1 ring-line transition-colors hover:bg-forest-50"
              >
                <span className="text-gold-700">{pill.icon}</span>
                {pill.label}
              </Link>
            </li>
          ))}
        </ul>

        {/* One-field para check — quotes the real zone charge + ETA. */}
        <form onSubmit={submit} className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <div>
            <label htmlFor={inputId} className="block text-sm font-semibold text-forest-900">
              {t("trust.checkTitle")}
            </label>
            <p className="mt-0.5 text-xs text-ink-soft">{t("trust.checkHint")}</p>
            <div className="mt-2 flex items-center gap-2 rounded-2xl bg-paper px-3 ring-1 ring-line focus-within:ring-2 focus-within:ring-forest-500">
              <IconMapPin className="h-4 w-4 shrink-0 text-ink-soft" />
              <input
                id={inputId}
                list={listId}
                value={para}
                onChange={(e) => {
                  setPara(e.target.value);
                  setChecked(null);
                }}
                placeholder={t("trust.checkPlaceholder")}
                autoComplete="address-level3"
                className="h-12 min-w-0 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-ink-soft/50 sm:text-sm"
              />
              <datalist id={listId}>
                {activeZones.flatMap((z) => z.areas).map((a) => (
                  <option key={a} value={a} />
                ))}
              </datalist>
            </div>
          </div>
          <button
            type="submit"
            className="inline-flex h-12 items-center justify-center rounded-full bg-forest-800 px-6 text-sm font-semibold text-ivory-50 transition-colors hover:bg-forest-700"
          >
            {t("trust.checkButton")}
          </button>
        </form>

        <p role="status" aria-live="polite" className="mt-3 text-sm text-forest-900" data-testid="home-delivery-result">
          {checked ? (
            zone ? (
              <>
                <span className="font-semibold">✓ </span>
                {t("trust.checkFound")
                  .replace("{zone}", zoneShort(zone))
                  .replace("{charge}", formatBdt(zone.charge))
                  .replace("{eta}", isCourierZone(zone.id) ? courierEta(lang) : zone.etaLabel)}
                {" · "}
                <Link
                  href="/shop"
                  className="font-semibold underline underline-offset-2 hover:text-forest-700"
                >
                  {t("trust.checkShop")}
                </Link>
              </>
            ) : (
              <span className="text-ink-soft">
                {t("trust.checkMissing").replace("{eta}", courierEta(lang))}{" "}
                <Link href="/contact" className="font-semibold underline underline-offset-2">
                  WhatsApp
                </Link>
              </span>
            )
          ) : null}
        </p>
      </div>
    </section>
  );
}
