import type { Metadata } from "next";
import LiveView from "@/components/live/live-view";
import { Eyebrow } from "@/components/ui/primitives";

export const metadata: Metadata = {
  title: "Live Shopping",
  description:
    "PROSANTI live shopping — watch the collection on air, order the pieces as they come on, delivered to Sunamganj.",
};

export default function LivePage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
      <Eyebrow>Watch it on, order it here</Eyebrow>
      <div className="mt-6">
        <LiveView />
      </div>
    </div>
  );
}
