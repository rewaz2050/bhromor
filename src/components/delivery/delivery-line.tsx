"use client";

/**
 * The PDP's personal delivery line (UX plan §4, 2026-09-26).
 *
 * "বড়পাড়ায় ডেলিভারি ৳৬০ · ক্যাশ অন ডেলিভারি · ৳৯৯৯+ অর্ডারে ফ্রি" — the
 * shopper's OWN zone (remembered from the home check / shop browser /
 * checkout), the zone's real charge and the free-delivery threshold, instead
 * of the generic "৳60–150". With no zone remembered it asks the one question
 * a first-time visitor has — "do you deliver to me?" — with a zone picker
 * that writes the same remembered zone every other surface reads.
 */

import { useLanguage } from "@/components/i18n/language-provider";
import { IconChevron, IconMapPin } from "@/components/ui/icons";
import type { Shop } from "@/lib/catalog";
import { courierEta, isCourierZone } from "@/lib/delivery";
import { useLiveZones } from "@/lib/use-live-zones";
import { useMyZone } from "@/lib/use-my-zone";
import { usePublicSettings } from "@/lib/use-public-settings";
import { freeDeliveryAmount, useFreeDelivery } from "@/lib/use-free-delivery";

export default function DeliveryLine({
  shop,
  className = "",
}: {
  shop: Pick<Shop, "freeDeliveryMinPaisa"> | null | undefined;
  className?: string;
}) {
  const { t, lang } = useLanguage();
  const { zoneId, setZoneId } = useMyZone();
  const { activeZones } = useLiveZones();
  const { settings } = usePublicSettings();
  const { target } = useFreeDelivery(shop, 0);
  const zone = zoneId ? activeZones.find((z) => z.id === zoneId) : undefined;
  const money = (paisa: number) => freeDeliveryAmount(paisa, lang);

  const picker = (
    <span className="relative inline-flex">
      <select
        value={zone?.id ?? ""}
        onChange={(e) => setZoneId(e.target.value || null)}
        aria-label={zone ? t("deliveryLine.change") : t("deliveryLine.choose")}
        data-testid="delivery-line-zone"
        className="h-9 max-w-[11rem] appearance-none rounded-full bg-paper pl-3 pr-7 text-xs font-semibold text-forest-900 ring-1 ring-line focus:outline-none focus:ring-2 focus:ring-forest-500"
      >
        <option value="">{t("deliveryLine.choose")}</option>
        {activeZones.map((z) => (
          <option key={z.id} value={z.id}>
            {z.name} · {money(z.charge)}
          </option>
        ))}
      </select>
      <IconChevron className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-soft" />
    </span>
  );

  let line: string;
  if (!zone) {
    line = t("deliveryLine.pickArea");
  } else if (isCourierZone(zone.id)) {
    line = t("deliveryLine.courier")
      .replace("{zone}", zone.name)
      .replace("{charge}", money(zone.charge))
      .replace("{eta}", courierEta(lang))
      .replace("{min}", money(settings.courierMinOrderPaisa));
  } else {
    const parts = [
      t("deliveryLine.toZone").replace("{zone}", zone.name).replace("{charge}", money(zone.charge)),
      t("deliveryLine.cod"),
    ];
    if (target !== null) parts.push(t("deliveryLine.freeOver").replace("{amount}", money(target)));
    line = parts.join(" · ");
  }

  return (
    <div
      data-testid="delivery-line"
      data-zone={zone?.id ?? ""}
      className={`flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl bg-ivory-100 px-3.5 py-2.5 text-xs font-medium text-forest-900 ring-1 ring-line ${className}`}
    >
      <span className="inline-flex min-w-0 items-start gap-2">
        <IconMapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold-600" aria-hidden="true" />
        <span>{line}</span>
      </span>
      {picker}
    </div>
  );
}
