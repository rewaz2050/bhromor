"use client";

/**
 * Sunamganj address book — saves real addresses locally for repeat orders.
 * No demo, just user's own saved addresses.
 */

import { SUNAMGANJ_DISTRICT, SUNAMGANJ_UPAZILA } from "./sunamganj";

export interface SavedAddress {
  id: string;
  label: string; // e.g. "Home - Boropara"
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

export const saveAddress = (addr: Omit<SavedAddress, "id" | "createdAt" | "district" | "upazila">): SavedAddress => {
  const all = getSavedAddresses();
  const entry: SavedAddress = {
    ...addr,
    id: `addr-${Date.now()}`,
    district: SUNAMGANJ_DISTRICT,
    upazila: SUNAMGANJ_UPAZILA,
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
}): string => {
  const segs: string[] = [];
  if (parts.houseNo?.trim()) segs.push(`House: ${parts.houseNo.trim()}`);
  if (parts.roadName?.trim()) segs.push(`Road: ${parts.roadName.trim()}`);
  if (parts.area?.trim()) segs.push(`Para: ${parts.area.trim()}`);
  segs.push(`${SUNAMGANJ_DISTRICT}, ${SUNAMGANJ_UPAZILA}`);
  if (parts.fullAddress?.trim()) segs.push(parts.fullAddress.trim());
  return segs.join(", ");
};
