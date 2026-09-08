import type { Metadata } from "next";
import TrackView from "@/components/track/track-view";
import { Eyebrow } from "@/components/ui/primitives";

export const metadata: Metadata = {
  title: "Track Order",
  description:
    "Track your PROSANTI order with your order ID and phone number — confirmation to doorstep, no account needed.",
};

export default function TrackPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
      <Eyebrow>Rapid delivery, transparently</Eyebrow>
      <h1 className="font-display mt-3 text-4xl font-medium tracking-tight text-forest-900 sm:text-5xl">
        Track your order
      </h1>
      <p className="mt-4 max-w-2xl leading-7 text-ink-soft">
        From confirmation to your doorstep — follow each step of your delivery
        in one calm timeline.
      </p>
      <div className="mt-10">
        <TrackView />
      </div>
    </div>
  );
}
