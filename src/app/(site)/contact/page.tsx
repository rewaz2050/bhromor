import type { Metadata } from "next";
import ContactForm from "@/components/contact/contact-form";
import { Eyebrow } from "@/components/ui/primitives";
import { IconPhone, IconMapPin } from "@/components/ui/icons";

export const metadata: Metadata = {
  title: "Contact",
  description: "Reach PROSANTI support — phone, WhatsApp, or a quick message form.",
};

const CHANNELS = [
  {
    title: "Call us",
    lines: ["01700-000000", "Sat–Thu · 9am–9pm"],
    href: "tel:+8801700000000",
  },
  {
    title: "WhatsApp",
    lines: ["Same number", "Fastest for order support"],
    href: "https://wa.me/8801700000000",
  },
  {
    title: "Email",
    lines: ["care@prosanti.store", "Replies within a few hours"],
    href: "mailto:care@prosanti.store",
  },
];

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

      <div className="mt-10 grid gap-6 lg:grid-cols-3">
        {CHANNELS.map((channel) => (
          <a
            key={channel.title}
            href={channel.href}
            target={channel.href.startsWith("http") ? "_blank" : undefined}
            rel={channel.href.startsWith("http") ? "noreferrer" : undefined}
            className="group rounded-3xl bg-paper p-7 ring-1 ring-line transition-shadow hover:shadow-lg"
          >
            <h2 className="font-display text-xl font-medium text-forest-900">
              {channel.title}
            </h2>
            {channel.lines.map((line) => (
              <p
                key={line}
                className="mt-1.5 text-sm text-ink-soft group-hover:text-forest-700"
              >
                {line}
              </p>
            ))}
          </a>
        ))}
      </div>

      <div className="mt-14 grid gap-10 lg:grid-cols-2">
        <ContactForm />
        <div className="flex flex-col justify-between gap-8 rounded-3xl bg-forest-900 p-8 text-ivory-100">
          <div>
            <h2 className="font-display text-2xl font-medium">
              Where we operate
            </h2>
            <p className="mt-3 text-sm leading-7 text-ivory-100/70">
              Orders are fulfilled from a local hub and delivered by our own
              riders. We currently serve a limited service area and publish the
              exact zones — we will never silently expand beyond what we can
              deliver on time.
            </p>
            <p className="mt-5 flex items-start gap-3 text-sm text-ivory-100/85">
              <IconMapPin className="mt-0.5 h-5 w-5 shrink-0 text-gold-300" />
              Fulfilment hub: Sunamganj Sadar, Traffic Point — District:
              Sunamganj, Upazila: Sunamganj Sadar. Real paras: Boropara,
              Shologhar, Notunpara, Mollapara &amp; more.
            </p>
            <p className="mt-3 flex items-start gap-3 text-sm text-ivory-100/85">
              <IconPhone className="mt-0.5 h-5 w-5 shrink-0 text-gold-300" />
              Support line: 01700-000000 (Sat–Thu, 9am–9pm)
            </p>
          </div>
          <p className="text-xs leading-5 text-ivory-100/50">
            Registered brand: PROSANTI · prosanti.store. Privacy and policy
            documents are linked in the footer.
          </p>
        </div>
      </div>
    </div>
  );
}
