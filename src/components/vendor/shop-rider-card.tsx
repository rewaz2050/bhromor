/**
 * Audit H — the rider on this order, for the owning shop: who is coming for
 * the parcel, and a one-tap call. Renders nothing when nobody is on the job.
 */
import type { Order } from "@/lib/orders";

export default function ShopRiderCard({ rider }: { rider?: Order["shopRider"] }) {
  if (!rider) return null;
  return (
    <section
      className="rounded-2xl bg-sky-50 p-5 ring-1 ring-sky-200"
      data-testid="vendor-rider-card"
      aria-label="Delivery rider"
    >
      <h3 className="text-xs font-semibold uppercase tracking-wider text-sky-900">
        🛵 Rider on this order
      </h3>
      <p className="mt-2 text-sm font-semibold text-forest-900">
        {rider.name}
        <span className="ml-2 text-xs font-normal capitalize text-ink-soft">{rider.vehicle}</span>
      </p>
      <p className="mt-1 text-xs text-sky-900" data-testid="vendor-rider-state">
        {rider.state === "accepted"
          ? "Pickup-এর জন্য আসছে — parcel রেডি রাখুন"
          : "Parcel নিয়ে গেছে — customer-এর পথে"}
      </p>
      <a
        href={`tel:${rider.phone}`}
        data-testid="vendor-rider-call"
        className="mt-3 inline-flex items-center gap-2 rounded-full bg-forest-800 px-4 py-2 text-xs font-semibold text-ivory-50 hover:bg-forest-900"
      >
        📞 Call {rider.phone}
      </a>
    </section>
  );
}
