"use client";

import { useMemo, useState } from "react";
import { deliveryBreakdown, freeThresholdForZone } from "@/lib/delivery";
import { findZoneByDistance, SUNAMGANJ_HUB_COORDS, distanceFromHubKm, type LatLng } from "@/lib/sunamganj";
import { formatBdt } from "@/lib/format";
import { bdt } from "@/lib/format";
import MapPinPicker from "@/components/checkout/map-pin-picker";

export function DeliveryFeeCalculator({ subtotalTaka = 500 }: { subtotalTaka?: number }) {
  const [pin, setPin] = useState<LatLng | null>(null);
  const [isNight, setIsNight] = useState(false);
  const [isRain, setIsRain] = useState(false);
  const [isExpress, setIsExpress] = useState(false);

  const calc = useMemo(() => {
    if (!pin) return null;
    const zone = findZoneByDistance(pin);
    const dist = distanceFromHubKm(pin);
    const breakdown = deliveryBreakdown({
      zone,
      subtotal: bdt(subtotalTaka),
      distanceKm: dist,
      isNight,
      isRain,
      isExpress,
    });
    return { zone, dist, breakdown };
  }, [pin, subtotalTaka, isNight, isRain, isExpress]);

  return (
    <div className="rounded-2xl bg-paper p-5 ring-1 ring-line space-y-4">
      <h4 className="font-display text-base font-semibold">🧮 Delivery Fee Calculator — Sunamganj Sadar (free, no cost)</h4>
      <p className="text-xs text-ink-soft">Pin your location on map, see exact fee with surcharges. OSM free, no Google cost.</p>
      <MapPinPicker value={pin} onChange={setPin} />
      <div className="flex flex-wrap gap-2">
        <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={isNight} onChange={(e) => setIsNight(e.target.checked)} /> Night (9PM-6AM +৳20)</label>
        <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={isRain} onChange={(e) => setIsRain(e.target.checked)} /> Rain +৳15</label>
        <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={isExpress} onChange={(e) => setIsExpress(e.target.checked)} /> Express +৳40</label>
      </div>
      {calc && (
        <div className="rounded-xl bg-ivory-50 p-3 ring-1 ring-line text-sm space-y-1">
          <p>Zone: {calc.zone.name} · Distance: {calc.dist.toFixed(2)} km from Traffic Point</p>
          <p>Base: {formatBdt(calc.breakdown.baseCharge)} · Free threshold: {formatBdt(freeThresholdForZone(calc.zone.id))}</p>
          <p>Surcharges: Night {formatBdt(calc.breakdown.surcharge.night)} + Rain {formatBdt(calc.breakdown.surcharge.rain)} + Distance {formatBdt(calc.breakdown.surcharge.distance)} + Express {formatBdt(calc.breakdown.surcharge.express)} = {formatBdt(calc.breakdown.surcharge.total)}</p>
          <p className="font-bold">Total Delivery: {calc.breakdown.freeDelivery ? "Free 🎉" : formatBdt(calc.breakdown.totalCharge)} · ETA: {calc.breakdown.eta}</p>
          {pin && <p className="text-[11px] text-ink-soft">📌 {pin.lat.toFixed(5)}, {pin.lng.toFixed(5)} · Hub {SUNAMGANJ_HUB_COORDS.lat},{SUNAMGANJ_HUB_COORDS.lng}</p>}
        </div>
      )}
    </div>
  );
}
