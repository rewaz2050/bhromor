import type { Metadata } from "next";
import Link from "next/link";
import { DELIVERY_ZONES } from "@/lib/catalog";
import { formatBdt } from "@/lib/format";
import { Eyebrow } from "@/components/ui/primitives";
import { IconTruck } from "@/components/ui/icons";

export const metadata: Metadata = {
  title: "Delivery Information",
  description:
    "PROSANTI delivery — zone-based charges, 45–50 minute rapid delivery target inside the service area, COD and tracking.",
};

export default function DeliveryPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:py-16">
      <Eyebrow>Transparent, zone-based</Eyebrow>
      <h1 className="font-display mt-3 text-4xl font-medium tracking-tight text-forest-900 sm:text-5xl">
        Delivery information
      </h1>
      <p className="mt-4 leading-7 text-ink-soft">
        Delivery is not a flat fee — it depends on your area. Choose your zone
        at checkout and the exact charge and arrival estimate appear before you
        pay.
      </p>

      {/* Promise */}
      <div className="mt-10 flex items-start gap-5 rounded-3xl bg-forest-900 p-7 text-ivory-100 sm:p-8">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-gold-300">
          <IconTruck className="h-6 w-6" />
        </span>
        <div>
          <h2 className="font-display text-2xl font-medium">
            The 45–50 minute target
          </h2>
          <p className="mt-2 text-sm leading-7 text-ivory-100/70">
            Preparation (~10 min) + courier assignment (~5 min) + travel time.
            This is our operational service target inside the service area — an
            estimate that can vary with distance, traffic and current capacity,
            and is always recalculated honestly.
          </p>
        </div>
      </div>

      {/* Zones */}
      <h2 className="font-display mt-12 text-2xl font-medium text-forest-900">
        Delivery zones (launch)
      </h2>
      <div className="mt-5 overflow-hidden rounded-3xl bg-paper ring-1 ring-line">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-line text-[0.7rem] uppercase tracking-[0.2em] text-ink-soft">
              <th className="px-5 py-4 font-semibold">Zone</th>
              <th className="px-5 py-4 font-semibold">Sample areas</th>
              <th className="px-5 py-4 font-semibold">Charge</th>
              <th className="px-5 py-4 font-semibold">ETA</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {DELIVERY_ZONES.map((zone) => (
              <tr key={zone.id}>
                <td className="px-5 py-4 font-medium text-ink">{zone.name}</td>
                <td className="px-5 py-4 text-ink-soft">
                  {zone.areas.join(", ")}
                </td>
                <td className="px-5 py-4 font-semibold text-ink">
                  {formatBdt(zone.charge)}
                </td>
                <td className="px-5 py-4 text-ink-soft">{zone.etaLabel}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="prose-prosanti mt-10">
        <h2>Good to know</h2>
        <ul>
          <li>
            <strong>Cash on Delivery</strong> is available inside the service
            area — pay only when the order arrives.
          </li>
          <li>
            <strong>Free delivery</strong> on orders over ৳2,000.
          </li>
          <li>
            Every order can be followed on the{" "}
            <Link href="/track">Track page</Link> with the order ID and phone
            number — no account needed.
          </li>
          <li>
            Orders are delivered by our own riders; a live courier map is
            planned for a later phase.
          </li>
          <li>
            We only expand delivery zones when the operation can reliably hold
            the promised window.
          </li>
        </ul>
      </div>
    </div>
  );
}
