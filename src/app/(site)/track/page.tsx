import type { Metadata } from "next";
import TrackView from "@/components/track/track-view";
import { Eyebrow } from "@/components/ui/primitives";
import L from "@/components/i18n/l";

export const metadata: Metadata = {
  title: "Track Order",
  description:
    "Track your PROSANTI order with your order ID and phone number — confirmation to doorstep, no account needed.",
};

export default function TrackPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
      {/* UI/UX pass 2026-10-15 — the page stayed a server component; only the
          text leaves read the language (the <L> leaf), the way the info
          pages do. A Bangla shopper used to read an English headline above a
          half-translated form. */}
      <Eyebrow>
        <L
          en="Rapid delivery, transparently"
          bn="দ্রুত ডেলিভারি, প্রতিটি ধাপ স্পষ্ট"
        />
      </Eyebrow>
      <h1 className="font-display mt-3 text-4xl font-medium tracking-tight text-forest-900 sm:text-5xl">
        <L en="Track your order" bn="অর্ডার ট্র্যাক করুন" />
      </h1>
      <p className="mt-4 max-w-2xl leading-7 text-ink-soft">
        <L
          en="From confirmation to your doorstep — follow each step of your delivery in one calm timeline."
          bn="কনফার্ম থেকে দরজা পর্যন্ত — আপনার ডেলিভারির প্রতিটি ধাপ একটাই টাইমলাইনে দেখুন।"
        />
      </p>
      <div className="mt-10">
        <TrackView />
      </div>
    </div>
  );
}
