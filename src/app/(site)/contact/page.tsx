import type { Metadata } from "next";
import InfoRail from "@/components/info/info-rail";
import ContactChannels from "@/components/contact/contact-channels";
import ContactForm from "@/components/contact/contact-form";
import { Eyebrow } from "@/components/ui/primitives";
import L from "@/components/i18n/l";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Reach PROSANTI support — phone, WhatsApp, or a quick message form.",
};

export default function ContactPage() {
  return (
    <>
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
      <Eyebrow><L en="We reply, quickly" bn="জবাব দিই, তাড়াতাড়ি" /></Eyebrow>
      <h1 className="font-display mt-3 text-4xl font-medium tracking-tight text-forest-900 sm:text-5xl">
        <L en="Contact" bn="যোগাযোগ" />
      </h1>
      <p className="mt-4 max-w-2xl leading-7 text-ink-soft">
        <L
          en="An order question, a delivery update, or feedback on a product — talk to a person, not a bot."
          bn="অর্ডার নিয়ে প্রশ্ন, ডেলিভারির খবর, বা পণ্য নিয়ে মতামত — কথা বলুন একজন মানুষের সাথে, বটের সাথে নয়।"
        />
      </p>

      <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_1.2fr]">
        <ContactChannels />
        <ContactForm />
      </div>
    </div>
    {/* UX plan §11 (R8) — leave with product in view, not a dead end. */}
    <InfoRail />
    </>
  );
}
