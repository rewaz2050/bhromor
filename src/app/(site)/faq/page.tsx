import type { Metadata } from "next";
import InfoRail from "@/components/info/info-rail";
import FaqList from "@/components/info/faq-list";

export const metadata: Metadata = {
  title: "FAQ",
  description: "Frequently asked questions about PROSANTI — delivery, payment, returns and more.",
};

export default function FaqPage() {
  return (
    <>
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:py-16">
      {/* UX plan §11 (R8) — bilingual, searchable; content in lib/faq.ts. */}
      <FaqList />
    </div>
    {/* UX plan §11 (R8) — leave with product in view, not a dead end. */}
    <InfoRail />
    </>
  );
}
