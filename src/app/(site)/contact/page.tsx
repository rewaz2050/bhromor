import type { Metadata } from "next";
import ContactChannels from "@/components/contact/contact-channels";
import ContactForm from "@/components/contact/contact-form";
import { Eyebrow } from "@/components/ui/primitives";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Reach PROSANTI support — phone, WhatsApp, or a quick message form.",
};

export default function ContactPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
      <Eyebrow>We reply, quickly</Eyebrow>
      <h1 className="font-display mt-3 text-4xl font-medium tracking-tight text-forest-900 sm:text-5xl">
        Contact
      </h1>
      <p className="mt-4 max-w-2xl leading-7 text-ink-soft">
        An order question, a delivery update, or feedback on a product — talk
        to a person, not a bot.
      </p>

      <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_1.2fr]">
        <ContactChannels />
        <ContactForm />
      </div>
    </div>
  );
}
