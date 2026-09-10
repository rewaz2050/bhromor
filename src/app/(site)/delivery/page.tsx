import type { Metadata } from "next";
import Link from "next/link";
import { getStorefrontZones } from "@/lib/db/storefront";
import { formatBdt } from "@/lib/format";
import { Eyebrow } from "@/components/ui/primitives";
import { IconTruck } from "@/components/ui/icons";

export const metadata: Metadata = {
  title: "Delivery Information — Sunamganj Sadar",
  description:
    "PROSANTI Sunamganj delivery — Traffic Point centric zones, first 1000 orders FREE, ৳1000+ free delivery, COD and tracking.",
};

export const dynamic = "force-dynamic";

export default async function DeliveryPage() {
  const { zones } = await getStorefrontZones();
  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:py-16">
      <Eyebrow>Sunamganj Sadar · Traffic Point centric</Eyebrow>
      <h1 className="font-display mt-3 text-4xl font-medium tracking-tight text-forest-900 sm:text-5xl">
        Delivery information — Sunamganj
      </h1>
      <p className="mt-4 leading-7 text-ink-soft">
        District: <strong>Sunamganj</strong> · Upazila: <strong>Sunamganj Sadar</strong>. Delivery charge depends on your para — Traffic Point থেকে 10-20 মিনিটের সাইকেল দূরত্ব অনুযায়ী। প্রথম ১০০০ অর্ডারে ডেলিভারি ফ্রি!
      </p>

      {/* Promise */}
      <div className="mt-10 flex items-start gap-5 rounded-3xl bg-forest-900 p-7 text-ivory-100 sm:p-8">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-gold-300">
          <IconTruck className="h-6 w-6" />
        </span>
        <div>
          <h2 className="font-display text-2xl font-medium">
            Instant delivery — the 45–50 minute target
          </h2>
          <p className="mt-2 text-sm leading-7 text-ivory-100/70">
            Instant delivery means: preparation (~10 min) + courier assignment
            (~5 min) + travel time.
            This is our operational service target inside the service area — an
            estimate that can vary with distance, traffic and current capacity,
            and is always recalculated honestly.
          </p>
        </div>
      </div>

      {/* Promo */}
      <div className="mt-8 rounded-2xl bg-gold-50 p-5 ring-1 ring-gold-200">
        <p className="text-sm font-bold text-forest-900">🎉 প্রথম ১০০০ অর্ডারে ডেলিভারি ফ্রি!</p>
        <p className="mt-1 text-xs leading-5 text-ink-soft">এরপর ৳১০০০+ অর্ডারে সবসময় ফ্রি। এর নিচে জায়গা অনুযায়ী: Zone A (Traffic Point 0-1.5km) ৳30, Zone B (Sadar Core) ৳50, Zone C (Extended) ৳70, Zone D (Sadar বাইরে) ৳100।</p>
      </div>

      {/* Zones */}
      <h2 className="font-display mt-12 text-2xl font-medium text-forest-900">
        Delivery zones — Sunamganj Sadar (launch)
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
            {zones.map((zone) => (
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
            <strong>First 1000 FREE</strong> — প্রথম ১০০০ অর্ডারে কোনো ডেলিভারি চার্জ নেই।
          </li>
          <li>
            <strong>Free delivery</strong> on orders over ৳1,000 — every order
            still arrives inside the instant-delivery window.
          </li>
          <li>
            <strong>Address box</strong> — checkout এ পাড়া সিলেক্ট করার পর আলাদা বক্সে বাড়ির নম্বর, রোডের নাম, পাড়ার বিস্তারিত, ল্যান্ডমার্ক + extra note লিখতে পারবেন।
          </li>
          <li>
            Every order can be followed on the{" "}
            <Link href="/track">Track page</Link> with the order ID and phone
            number — no account needed.
          </li>
          <li>
            Orders are delivered by our own riders — open the{" "}
            <Link href="/track">Track page</Link> to follow the live courier
            route map once an order is under way.
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
