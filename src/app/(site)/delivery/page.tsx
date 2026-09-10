import type { Metadata } from "next";
import Link from "next/link";
import { getStorefrontZones } from "@/lib/db/storefront";
import { formatBdt } from "@/lib/format";
import { Eyebrow } from "@/components/ui/primitives";
import { IconTruck, IconMapPin, IconGift } from "@/components/ui/icons";
import DeliveryPromoLive from "@/components/delivery/delivery-promo-live";

export const metadata: Metadata = {
  title: "Delivery Information — Sunamganj Sadar",
  description:
    "PROSANTI Sunamganj delivery — Traffic Point centric zones, first 1000 orders FREE, ৳1000+ free delivery, COD and tracking. District Sunamganj, Upazila Sunamganj Sadar.",
};

export const dynamic = "force-dynamic";

export default async function DeliveryPage() {
  const { zones } = await getStorefrontZones();
  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:py-16">
      <Eyebrow>Sunamganj Sadar · Traffic Point centric · Real data</Eyebrow>
      <h1 className="font-display mt-3 text-4xl font-medium tracking-tight text-forest-900 sm:text-5xl">
        Delivery information — Sunamganj Sadar
      </h1>
      <p className="mt-4 leading-7 text-ink-soft">
        District: <strong>Sunamganj</strong> · Upazila: <strong>Sunamganj Sadar</strong> · Hub: <strong>Traffic Point</strong>.
        Delivery charge depends on your para — Traffic Point থেকে 10-20 মিনিটের সাইকেল দূরত্ব অনুযায়ী। প্রথম ১০০০ অর্ডারে ডেলিভারি ফ্রি! সব real para, কোনো demo না।
      </p>

      {/* Live Promo Counter */}
      <DeliveryPromoLive />

      {/* Promise */}
      <div className="mt-8 flex items-start gap-5 rounded-3xl bg-forest-900 p-7 text-ivory-100 sm:p-8">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-gold-300">
          <IconTruck className="h-6 w-6" />
        </span>
        <div>
          <h2 className="font-display text-2xl font-medium">
            Instant delivery — Sunamganj Sadar target
          </h2>
          <p className="mt-2 text-sm leading-7 text-ivory-100/70">
            Instant delivery means: preparation (~10 min) + courier assignment
            (~5 min) + travel time from Traffic Point.
            Zone A (0-1.5km) 30-40 min, Zone B (1.5-2.5km) 40-50 min, Zone C (2.5-4km) 50-60 min, Zone D (outside) 60-80 min.
            This is our operational target — varies with traffic and capacity.
          </p>
        </div>
      </div>

      {/* Zones */}
      <h2 className="font-display mt-12 text-2xl font-medium text-forest-900">
        Delivery zones — Sunamganj Sadar (real paras)
      </h2>
      <div className="mt-5 overflow-hidden rounded-3xl bg-paper ring-1 ring-line">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-line text-[0.7rem] uppercase tracking-[0.2em] text-ink-soft">
              <th className="px-5 py-4 font-semibold">Zone</th>
              <th className="px-5 py-4 font-semibold">Real Paras (Sunamganj)</th>
              <th className="px-5 py-4 font-semibold">Charge</th>
              <th className="px-5 py-4 font-semibold">ETA</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {zones.map((zone) => (
              <tr key={zone.id} className={zone.id === "z4" ? "bg-amber-50/50" : ""}>
                <td className="px-5 py-4 font-medium text-ink">
                  {zone.name}
                  {zone.id === "z4" && <span className="ml-2 rounded-full bg-amber-200 px-2 py-0.5 text-[10px] font-bold text-amber-900">OUTSIDE</span>}
                </td>
                <td className="px-5 py-4 text-ink-soft">
                  {zone.areas.join(", ")}
                </td>
                <td className="px-5 py-4 font-semibold text-ink">
                  {formatBdt(zone.charge)}
                  {zone.id === "z4" && <span className="block text-[11px] font-normal text-ink-soft">Min ৳500 order</span>}
                </td>
                <td className="px-5 py-4 text-ink-soft">{zone.etaLabel}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Address box explanation */}
      <div className="mt-8 rounded-2xl bg-ivory-100 p-6 ring-1 ring-line">
        <h3 className="font-display text-lg font-medium text-forest-900 flex items-center gap-2">
          <IconMapPin className="h-5 w-5 text-forest-700" />
          Address box — how to fill
        </h3>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 text-sm leading-6 text-ink-soft">
          <div>
            <p className="font-semibold text-ink">1. জেলা / উপজেলা (auto)</p>
            <p>District: Sunamganj, Upazila: Sunamganj Sadar — auto added, you don&apos;t need to type.</p>
          </div>
          <div>
            <p className="font-semibold text-ink">2. পাড়া / Para</p>
            <p>Type Boropara, Shologhar, Notunpara etc — zone auto-detects. Real list from Traffic Point.</p>
          </div>
          <div>
            <p className="font-semibold text-ink">3. বাড়ি + রোড</p>
            <p>House No: 12/A, Holding 45. Road: College Road, Hospital Road — datalist suggestions.</p>
          </div>
          <div>
            <p className="font-semibold text-ink">4. Full address + note</p>
            <p>Landmark, floor, extra: &quot;2nd floor, near Mosque, call before arriving&quot; — saved for next order.</p>
          </div>
        </div>
      </div>

      {/* Time slots */}
      <div className="mt-8 rounded-2xl bg-paper p-6 ring-1 ring-line">
        <h3 className="font-display text-lg font-medium text-forest-900">Delivery slots — Sunamganj Sadar</h3>
        <div className="mt-4 grid gap-3 sm:grid-cols-3 text-sm">
          <div className="rounded-xl bg-forest-50 px-4 py-3 ring-1 ring-forest-200">
            <p className="font-semibold">⚡ এখনই</p>
            <p className="text-xs text-ink-soft">30-50 min — instant</p>
          </div>
          <div className="rounded-xl bg-ivory-100 px-4 py-3 ring-1 ring-line">
            <p className="font-semibold">🌙 সন্ধ্যায়</p>
            <p className="text-xs text-ink-soft">6-9 PM — evening</p>
          </div>
          <div className="rounded-xl bg-ivory-100 px-4 py-3 ring-1 ring-line">
            <p className="font-semibold">🌅 কাল সকালে</p>
            <p className="text-xs text-ink-soft">9-12 AM — tomorrow</p>
          </div>
        </div>
      </div>

      <div className="prose-prosanti mt-10">
        <h2>Good to know — Sunamganj real</h2>
        <ul>
          <li>
            <strong>District fixed:</strong> Sunamganj, Upazila: Sunamganj Sadar — hub Traffic Point. No Comilla, all real.
          </li>
          <li>
            <strong>Real paras:</strong> Boropara, Shologhar, Notunpara, Mollapara, Ukilpara, Kalibari, Arambagh, Modhyabazar, Purba/Paschim Bazar, Nabinagar, Tegharia, Hasannagar, Sahib Bari Ghat, Jaliapara, Kazir Point, Hospital Road, Wayesspur, Balaka etc.
          </li>
          <li>
            <strong>Outside extra:</strong> Zone D (Sunamganj Sadar Bahire) ৳100 + minimum ৳500 order. Para list: Dolura, Gouripur, Surma River Side etc.
          </li>
          <li>
            <strong>First 1000 FREE</strong> — live counter উপরে দেখুন, real DB count থেকে। <Link href="/api/promo" className="underline">/api/promo</Link> public.
          </li>
          <li>
            <strong>Free delivery</strong> on orders over ৳1,000 — every order still arrives inside instant window. First 1000 এর পরও ৳1000+ free.
          </li>
          <li>
            <strong>Auto zone detect</strong> — para লিখলেই zone auto select, no manual needed.
          </li>
          <li>
            <strong>Address book</strong> — checkout এ address save হয়, next time 1 click এ use.
          </li>
          <li>
            <strong>Road suggestions</strong> — College Road, Hospital Road etc datalist থেকে select.
          </li>
          <li>
            <strong>Geolocation</strong> — &quot;Use my location&quot; button auto nearest zone (Traffic Point centric).
          </li>
          <li>
            Every order can be followed on the{" "}
            <Link href="/track">Track page</Link> with order ID and phone — PIN required for COD.
          </li>
          <li>
            Orders delivered by our own riders — Sunamganj Sadar only.
          </li>
        </ul>
      </div>
    </div>
  );
}
