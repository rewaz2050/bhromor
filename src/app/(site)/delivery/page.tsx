import type { Metadata } from "next";
import Link from "next/link";
import { getStorefrontZones } from "@/lib/db/storefront";
import { formatBdt } from "@/lib/format";
import { Eyebrow } from "@/components/ui/primitives";
import { IconTruck, IconMapPin } from "@/components/ui/icons";
import LaunchOfferBanner from "@/components/delivery/launch-offer-banner";


export const metadata: Metadata = {
  title: "Delivery Information — Sunamganj",
  description:
    "PROSANTI delivery — সহজ ফর্মে অর্ডার: জেলা → উপজেলা → পাড়া। প্রথম ১০টি অর্ডারে ডেলিভারি ফ্রি (শুধু সুনামগঞ্জ সিটি এ জোনে)। বাইরে জোন চার্জ ৳৫০–৳১০০। COD ও ট্র্যাকিং।",
};

export const dynamic = "force-dynamic";

export default async function DeliveryPage() {
  const { zones } = await getStorefrontZones();
  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:py-16">
      <Eyebrow>Sunamganj · জেলা → উপজেলা → পাড়া · সহজ অর্ডার</Eyebrow>
      <h1 className="font-display mt-3 text-4xl font-medium tracking-tight text-forest-900 sm:text-5xl">
        Delivery information — Sunamganj
      </h1>
      <p className="mt-4 leading-7 text-ink-soft">
        অর্ডার করতে এখন শুধু একটি <strong>সহজ ফর্ম</strong> পূরণ করুন —{" "}
        <strong>জেলা</strong> সিলেক্ট করুন, <strong>উপজেলা</strong> সিলেক্ট করুন,
        আর সুনামগঞ্জ সদরের ভেতরে থাকলে তালিকা থেকে <strong>পাড়া</strong> সিলেক্ট
        করুন (না পেলে নিজে লিখুন)। তারপর বাসা/রোড লিখে অর্ডার কনফার্ম — ক্যাশ অন
        ডেলিভারি।
      </p>

      {/* Live Promo Counter */}
      <LaunchOfferBanner />

      {/* Promise */}
      <div className="mt-8 flex items-start gap-5 rounded-3xl bg-forest-900 p-7 text-ivory-100 sm:p-8">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-gold-300">
          <IconTruck className="h-6 w-6" />
        </span>
        <div>
          <h2 className="font-display text-2xl font-medium">
            Instant delivery — Sunamganj target
          </h2>
          <p className="mt-2 text-sm leading-7 text-ivory-100/70">
            Zone A 30–40 min, Zone B 40–50 min, Zone C 50–60 min, Zone D
            (বাইরে) 60–80 min. এটি আমাদের অপারেশনাল টার্গেট — ট্রাফিক ও
            ক্যাপাসিটি অনুযায়ী কিছুটা কম-বেশি হতে পারে।
          </p>
        </div>
      </div>

      {/* Zones */}
      <h2 className="font-display mt-12 text-2xl font-medium text-forest-900">
        Delivery zones — Sunamganj
      </h2>
      <div className="mt-5 overflow-hidden rounded-3xl bg-paper ring-1 ring-line">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-line text-[0.7rem] uppercase tracking-[0.2em] text-ink-soft">
              <th className="px-5 py-4 font-semibold">Zone</th>
              <th className="px-5 py-4 font-semibold">Paras (Sunamganj)</th>
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

      {/* How the simple form works */}
      <div className="mt-8 rounded-2xl bg-ivory-100 p-6 ring-1 ring-line">
        <h3 className="font-display text-lg font-medium text-forest-900 flex items-center gap-2">
          <IconMapPin className="h-5 w-5 text-forest-700" />
          সহজ ফর্ম — কীভাবে পূরণ করবেন
        </h3>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 text-sm leading-6 text-ink-soft">
          <div>
            <p className="font-semibold text-ink">1. নাম ও মোবাইল নম্বর</p>
            <p>রাইডার এই নম্বরে কল করবে — সঠিক ১১ ডিজিটের নম্বর দিন।</p>
          </div>
          <div>
            <p className="font-semibold text-ink">2. জেলা → উপজেলা</p>
            <p>ড্রপডাউন থেকে জেলা ও উপজেলা সিলেক্ট করুন। ডিফল্ট: সুনামগঞ্জ সদর।</p>
          </div>
          <div>
            <p className="font-semibold text-ink">3. পাড়া / গ্রাম</p>
            <p>সুনামগঞ্জ সদরে তালিকা থেকে পাড়া সিলেক্ট করুন — জোন ও চার্জ অটো হিসাব হয়। তালিকায় না থাকলে &quot;অন্য পাড়া&quot; বেছে নিজে লিখুন।</p>
          </div>
          <div>
            <p className="font-semibold text-ink">4. বিস্তারিত ঠিকানা</p>
            <p>বাসা নম্বর, রোড, ল্যান্ডমার্ক, ফ্লোর — জেলা/উপজেলা/পাড়া অটো যোগ হয়ে যায়।</p>
          </div>
        </div>
      </div>

      <div className="prose-prosanti mt-10">
        <h2>Good to know</h2>
        <ul>
          <li>
            <strong>প্রতিটি কাস্টমারের প্রথম 60 অর্ডারে ডেলিভারি সম্পূর্ণ ফ্রি</strong> — শুধুমাত্র{" "}
            <strong>সুনামগঞ্জ সিটি (এ জোন)</strong>-এর ভেতরে। একই মোবাইল নম্বরে ১০টি অর্ডার
            হয়ে গেলে জোন চার্জ প্রযোজ্য।
          </li>
          <li>
            <strong>এ জোনের বাইরে চার্জ যোগ হবে:</strong> Zone B ৳50, Zone C ৳70,
            Zone D (সদরের বাইরে / অন্য উপজেলা / অন্য জেলা — কুরিয়ার) ৳100।
            ফ্রি অফার শুধু এ জোনে, সব জায়গায় নয়।
          </li>
          <li>
            <strong>Zone D-তে সর্বনিম্ন ৳৫০০ অর্ডার</strong> — সুনামগঞ্জ সদরের বাইরের
            ডেলিভারিতে প্রযোজ্য।
          </li>
          <li>
            <strong>জোন অটো-ডিটেক্ট</strong> — পাড়া সিলেক্ট করলেই চার্জ ও সময় দেখা যাবে,
            কোনো ম্যাপ বা পিন লাগবে না।
          </li>
          <li>
            Every order can be followed on the{" "}
            <Link href="/track">Track page</Link> with order ID and phone — PIN required for COD.
          </li>
          <li>
            Orders delivered by our own riders — Sunamganj।
          </li>
        </ul>
      </div>
    </div>
  );
}
