import type { Metadata } from "next";
import InfoRail from "@/components/info/info-rail";
import Link from "next/link";
import { getStorefrontZones } from "@/lib/db/storefront";
import { readOpsSettings } from "@/lib/db/engagement";
import { sanitizeSettings } from "@/lib/settings-store";
import { getSupabaseService } from "@/lib/supabase-server";
import { MIN_ORDER_OUTSIDE_SADAR_PAISA } from "@/lib/delivery";
import { Eyebrow } from "@/components/ui/primitives";
import L from "@/components/i18n/l";
import HomeDeliveryCheck from "@/components/home/home-delivery-check";
import { IconTruck, IconMapPin } from "@/components/ui/icons";
import { formatBdt } from "@/lib/format";
import {
  COURIER_ETA_BN,
  DELIVERY_CHARGE_LADDER_BN,
  DELIVERY_CHARGE_PROMISE_BN,
  courierEta,
  isCourierZone,
} from "@/lib/delivery";


export const metadata: Metadata = {
  title: "Delivery Information — Sunamganj",
  description:
    "PROSANTI delivery — সহজ ফর্মে অর্ডার: জেলা → উপজেলা → পাড়া। ডেলিভারি ৳৬০ থেকে (শহরে ৳৬০ · আশেপাশে ৳১২০ · দূরে ৳১৫০)। স্টোর পিকআপ ও ফ্রি-ডেলিভারি কুপন ফ্রি। COD ও ট্র্যাকিং।",
};

export const dynamic = "force-dynamic";

export default async function DeliveryPage() {
  const [{ zones }, ops] = await Promise.all([
    getStorefrontZones(),
    readOpsSettings(getSupabaseService()!)
      .then(sanitizeSettings)
      .catch(() => null),
  ]);
  // The owner's floor when set; the launch ৳500 otherwise. A fallback-DB
  // read answers null → the same launch label.
  const courierMinPaisa = ops?.courierMinOrderPaisa ?? MIN_ORDER_OUTSIDE_SADAR_PAISA;
  const courierMinLabel = `৳${Math.round(courierMinPaisa / 100)}`;
  return (
    <>
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:py-16">
      <Eyebrow>Sunamganj · জেলা → উপজেলা → পাড়া · সহজ অর্ডার</Eyebrow>
      <h1 className="font-display mt-3 text-4xl font-medium tracking-tight text-forest-900 sm:text-5xl">
        <L en="Delivery information — Sunamganj" bn="ডেলিভারির খুঁটিনাটি — সুনামগঞ্জ" />
      </h1>
      <p className="mt-4 leading-7 text-ink-soft">
        অর্ডার করতে এখন শুধু একটি <strong>সহজ ফর্ম</strong> পূরণ করুন —{" "}
        <strong>জেলা</strong> সিলেক্ট করুন, <strong>উপজেলা</strong> সিলেক্ট করুন,
        আর সুনামগঞ্জ সদরের ভেতরে থাকলে তালিকা থেকে <strong>পাড়া</strong> সিলেক্ট
        করুন (না পেলে নিজে লিখুন)। তারপর বাসা/রোড লিখে অর্ডার কনফার্ম — ক্যাশ অন
        ডেলিভারি।
      </p>

      {/* UX plan §11 (R9) — the zone checker at the top: "do you come to my
          para, for how much?" answered before the table is read. */}
      <div className="mt-8 overflow-hidden rounded-3xl ring-1 ring-line">
        <HomeDeliveryCheck />
      </div>

      {/* Delivery promise — the same sentence the bag and checkout show */}
      <div className="mt-8 rounded-2xl bg-gold-50 px-5 py-4 text-sm text-forest-900 ring-1 ring-gold-200">
        <IconTruck className="mr-1 inline h-4 w-4 align-[-3px]" /> <strong>{DELIVERY_CHARGE_PROMISE_BN}</strong> — {DELIVERY_CHARGE_LADDER_BN}। সারচার্জ: Night +৳২০ · Rain +৳১৫ · Express ৩০মিনিট +৳৪০ · ৫ কেজির পর প্রতি কেজি +৳১০। স্টোর পিকআপ ও ফ্রি-ডেলিভারি কুপন ফ্রি।
      </div>

      {/* Promise */}
      <div className="mt-8 flex items-start gap-5 rounded-3xl bg-forest-900 p-7 text-ivory-100 sm:p-8">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-gold-300">
          <IconTruck className="h-6 w-6" />
        </span>
        <div>
          <h2 className="font-display text-2xl font-medium">
            <L en="Instant delivery — Sunamganj target" bn="তাড়াতাড়ি ডেলিভারি — সুনামগঞ্জের লক্ষ্য" />
          </h2>
          <p className="mt-2 text-sm leading-7 text-ivory-100/70">
            <L
              en="Zone A 30–40 min, Zone B 40–50 min, Zone C 50–60 min — our own riders inside Sadar."
              bn="জোন A ৩০–৪০ মিনিট, জোন B ৪০–৫০ মিনিট, জোন C ৫০–৬০ মিনিট — সদরের ভেতরে আমাদের নিজের রাইডার।"
            /> সদরের বাইরে / অন্য জেলা: {COURIER_ETA_BN}। এটি
            আমাদের অপারেশনাল টার্গেট — ট্রাফিক ও ক্যাপাসিটি অনুযায়ী কিছুটা
            কম-বেশি হতে পারে।
          </p>
        </div>
      </div>

      {/* Zones */}
      <h2 className="font-display mt-12 text-2xl font-medium text-forest-900">
        <L en="Delivery zones — Sunamganj" bn="ডেলিভারি জোন — সুনামগঞ্জ" />
      </h2>
      <div className="mt-5 overflow-hidden rounded-3xl bg-paper ring-1 ring-line">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-line text-[0.7rem] uppercase tracking-[0.2em] text-ink-soft">
              <th className="px-5 py-4 font-semibold"><L en="Zone" bn="জোন" /></th>
              <th className="px-5 py-4 font-semibold"><L en="Paras (Sunamganj)" bn="পাড়া (সুনামগঞ্জ)" /></th>
              <th className="px-5 py-4 font-semibold"><L en="Delivery charge" bn="ডেলিভারি চার্জ" /></th>
              <th className="px-5 py-4 font-semibold"><L en="ETA" bn="কতক্ষণে" /></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {zones.map((zone) => (
              <tr key={zone.id} className={zone.id === "z4" ? "bg-amber-50/50" : ""}>
                <td className="px-5 py-4 font-medium text-ink">
                  {zone.name}
                  {zone.id === "z4" && <span className="ml-2 rounded-full bg-amber-200 px-2 py-0.5 text-[10px] font-bold text-amber-900"><L en="OUTSIDE" bn="সদরের বাইরে" /></span>}
                </td>
                <td className="px-5 py-4 text-ink-soft">
                  {zone.areas.join(", ")}
                </td>
                <td className="px-5 py-4 font-semibold text-ink">
                  {formatBdt(zone.charge)}
                  {zone.id === "z4" && <span className="block text-[11px] font-normal text-ink-soft"><L en={`Min ${courierMinLabel} order`} bn={`সর্বনিম্ন অর্ডার ${courierMinLabel}`} /></span>}
                </td>
                <td className="px-5 py-4 text-ink-soft">
                  {isCourierZone(zone.id) ? courierEta("en") : zone.etaLabel}
                </td>
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
        <h2><L en="Good to know" bn="জেনে রাখুন" /></h2>
        <ul>
          <li>
            <strong>ডেলিভারি চার্জ ঠিকানা অনুযায়ী</strong> — {DELIVERY_CHARGE_LADDER_BN}।
            চেকআউটে ঠিকানা দিলেই সঠিক চার্জ দেখা যায় — কোনো লুকানো চার্জ নেই।
          </li>
          <li>
            <strong>সারচার্জ:</strong> Night (৯টা–সকাল ৬টা) +৳২০ · Rain +৳১৫ ·
            Express ৩০ মিনিট +৳৪০ · ৫ কেজির বেশি হলে প্রতি কেজি +৳১০।
          </li>
          <li>
            <strong>স্টোর পিকআপ ফ্রি</strong> — Traffic Point হাবে উঠিয়ে নিলে
            কোনো ডেলিভারি চার্জ লাগে না। ফ্রি-ডেলিভারি কুপনও ডেলিভারি ফ্রি করে।
          </li>
          <li>
            <strong>Zone D-তে সর্বনিম্ন {courierMinLabel} অর্ডার</strong> — সুনামগঞ্জ সদরের বাইরের
            (অন্য উপজেলা / অন্য জেলা) ডেলিভারিতে প্রযোজ্য।
          </li>
          <li>
            <strong>জোন অটো-ডিটেক্ট</strong> — পাড়া সিলেক্ট করলেই ETA দেখা যাবে,
            কোনো ম্যাপ বা পিন লাগবে না।
          </li>
          <li>
            <L
              en={<>Every order can be followed on the <Link href="/track">Track page</Link> with order ID and phone — PIN required for COD.</>}
              bn={<>অর্ডার আইডি আর ফোন নম্বর দিয়ে <Link href="/track">ট্র্যাক পেজে</Link> প্রতিটি অর্ডার দেখা যায় — ক্যাশ অন ডেলিভারিতে PIN লাগে।</>}
            />
          </li>
          <li>
            <L en="Orders are delivered by our own riders — Sunamganj." bn="অর্ডার পৌঁছে দেয় আমাদের নিজের রাইডার — সুনামগঞ্জ।" />
          </li>
        </ul>
      </div>
    </div>
    {/* UX plan §11 (R8) — leave with product in view, not a dead end. */}
    <InfoRail />
    </>
  );
}
