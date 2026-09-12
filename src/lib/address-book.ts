"use client";

/**
 * Sunamganj address book — saves real addresses locally for repeat orders.
 * Now with lat/lng map pin.
 */

import { SUNAMGANJ_DISTRICT, SUNAMGANJ_UPAZILA } from "./sunamganj";
import type { LatLng } from "./sunamganj";

export type AddressTag = "home" | "office" | "other";

export const ADDRESS_TAG_EMOJI: Record<AddressTag, string> = {
  home: "🏠",
  office: "🏢",
  other: "📍",
};

export interface SavedAddress {
  id: string;
  label: string; // e.g. "🏠 Home - Boropara"
  name: string;
  phone: string;
  area: string; // para
  houseNo: string;
  roadName: string;
  fullAddress: string;
  note: string;
  zoneId: string;
  district: string;
  upazila: string;
  tag: AddressTag;
  lat?: number;
  lng?: number;
  createdAt: number;
}

const KEY = "prosanti.address-book.v1";

const safeParse = (raw: string | null): SavedAddress[] => {
  if (!raw) return [];
  try {
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
};

export const getSavedAddresses = (): SavedAddress[] => {
  if (typeof window === "undefined") return [];
  return safeParse(localStorage.getItem(KEY));
};

export const saveAddress = (
  addr: Omit<SavedAddress, "id" | "createdAt" | "district" | "upazila" | "tag"> & {
    tag?: AddressTag;
  },
): SavedAddress => {
  const all = getSavedAddresses();
  const entry: SavedAddress = {
    ...addr,
    id: `addr-${Date.now()}`,
    district: SUNAMGANJ_DISTRICT,
    upazila: SUNAMGANJ_UPAZILA,
    tag: addr.tag ?? "other",
    createdAt: Date.now(),
  };
  // Keep max 5, newest first
  const next = [entry, ...all.filter((a) => a.fullAddress !== addr.fullAddress)].slice(0, 5);
  localStorage.setItem(KEY, JSON.stringify(next));
  return entry;
};

export const deleteAddress = (id: string): void => {
  const all = getSavedAddresses();
  localStorage.setItem(KEY, JSON.stringify(all.filter((a) => a.id !== id)));
};

export const formatFullAddress = (parts: {
  houseNo?: string;
  roadName?: string;
  area: string;
  fullAddress: string;
  latLng?: LatLng | null;
}): string => {
  const segs: string[] = [];
  if (parts.houseNo?.trim()) segs.push(`House: ${parts.houseNo.trim()}`);
  if (parts.roadName?.trim()) segs.push(`Road: ${parts.roadName.trim()}`);
  if (parts.area?.trim()) segs.push(`Para: ${parts.area.trim()}`);
  segs.push(`${SUNAMGANJ_DISTRICT}, ${SUNAMGANJ_UPAZILA}`);
  if (parts.fullAddress?.trim()) segs.push(parts.fullAddress.trim());
  if (parts.latLng) segs.push(`Pin: ${parts.latLng.lat.toFixed(5)},${parts.latLng.lng.toFixed(5)}`);
  return segs.join(", ");
};
