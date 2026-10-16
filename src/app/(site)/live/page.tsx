import type { Metadata } from "next";
import LiveView from "@/components/live/live-view";
import { Eyebrow } from "@/components/ui/primitives";
import L from "@/components/i18n/l";

export const metadata: Metadata = {
  title: "Live Shopping",
  description:
    "PROSANTI live shopping — watch the collection on air, order the pieces as they come on, delivered to Sunamganj.",
};

export default function LivePage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
      <Eyebrow>
        <L en="Watch it on, order it here" bn="লাইভে দেখুন, এখানেই অর্ডার করুন" />
      </Eyebrow>
      <div className="mt-6">
        <LiveView />
      </div>
    </div>
  );
}
