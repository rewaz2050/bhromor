import { bnDigits } from "./arrival";
import { haversineKm, type LatLng } from "./sunamganj";
import type { Language } from "./translations";

/** A city bike with a parcel, honestly: ~15 km/h door to door. */
export const RIDER_KMH = 15;

export interface RiderDistance {
  km: number;
  minutes: number;
  /** "800 m" / "1.2 km" — Bengali digits in bn. */
  distanceLabel: string;
}

/**
 * How far the rider's last live position is from the delivery pin, and the
 * rough minutes that means (UX plan §7). Null unless both points are real.
 */
export const riderDistance = (
  rider: LatLng | null | undefined,
  destination: Partial<LatLng> | null | undefined,
  lang: Language = "bn",
): RiderDistance | null => {
  if (!rider || !destination || destination.lat == null || destination.lng == null) return null;
  if (![rider.lat, rider.lng, destination.lat, destination.lng].every(Number.isFinite)) return null;
  const km = haversineKm(rider, { lat: destination.lat, lng: destination.lng });
  if (!Number.isFinite(km) || km > 60) return null; // a stale/foreign fix is not a promise
  const minutes = Math.max(1, Math.round((km / RIDER_KMH) * 60));
  const raw =
    km < 1
      ? `${Math.max(50, Math.round(km * 1000 / 50) * 50)} ${lang === "bn" ? "মিটার" : "m"}`
      : `${km.toFixed(1)} ${lang === "bn" ? "কিমি" : "km"}`;
  return { km, minutes, distanceLabel: lang === "bn" ? bnDigits(raw) : raw };
};
