/**
 * Navigation deep links for the rider. `dir` links start turn-by-turn from the
 * rider's CURRENT position (no origin given) in two-wheeler mode — one tap,
 * where the old `search` link only dropped a pin the rider had to route to.
 */

const DIR = "https://www.google.com/maps/dir/?api=1&travelmode=two-wheeler&destination=";

interface Place {
  lat?: number | null;
  lng?: number | null;
}

/** A saved geo pin wins; else the written address; null when there is neither. */
export const navHref = (place: Place, addressParts: readonly (string | null | undefined)[]): string | null => {
  if (place.lat && place.lng) return `${DIR}${place.lat},${place.lng}`;
  const q = addressParts.map((p) => (p ?? "").trim()).filter(Boolean).join(", ");
  return q ? `${DIR}${encodeURIComponent(q)}` : null;
};

export const customerNavHref = (order: {
  lat?: number | null;
  lng?: number | null;
  customer: { address?: string | null; area?: string | null };
}): string | null => navHref(order, [order.customer.address, order.customer.area, "Sunamganj"]);

export const shopNavHref = (shop: { name?: string | null; address?: string | null }): string | null =>
  shop.address?.trim() ? navHref({}, [shop.address, "Sunamganj"]) : null;
