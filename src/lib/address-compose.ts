/**
 * The address string the rider reads (checkout pass, 2026-10-06).
 *
 * Pulled out of the checkout form so it can be tested on its own — and so
 * the one thing a rider in Sunamganj actually navigates by, the landmark,
 * is a first-class part of the address instead of a hint inside an error
 * message. A holding number is how a house is registered; "মসজিদের পাশে"
 * is how it is found.
 *
 * Pure (unit-tested). Blanks are skipped, never rendered as empty commas.
 */

export interface AddressParts {
  houseNo?: string;
  roadName?: string;
  landmark?: string;
  /** The free-text "বিস্তারিত ঠিকানা" box. */
  address?: string;
  para?: string;
  upazila?: string;
  district?: string;
  /** Map pin, when the shopper dropped one. */
  pin?: { lat: number; lng: number } | null;
}

export const composeFullAddress = (parts: AddressParts): string => {
  const segs: string[] = [];
  const push = (prefix: string, value?: string): void => {
    const v = value?.trim();
    if (v) segs.push(`${prefix}${v}`);
  };

  push("House: ", parts.houseNo);
  push("Road: ", parts.roadName);
  push("Landmark: ", parts.landmark);
  push("", parts.address);
  push("Para: ", parts.para);
  push("", parts.upazila);
  push("", parts.district);
  if (parts.pin) {
    segs.push(`Pin: ${parts.pin.lat.toFixed(5)},${parts.pin.lng.toFixed(5)}`);
  }
  return segs.join(", ");
};
