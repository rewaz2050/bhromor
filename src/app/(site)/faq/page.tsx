import type { Metadata } from "next";
import Link from "next/link";
import { Eyebrow } from "@/components/ui/primitives";

export const metadata: Metadata = {
  title: "FAQ",
  description: "Frequently asked questions about PROSANTI — delivery, payment, returns and more.",
};

const FAQS = [
  {
    q: "How fast is delivery?",
    a: "Inside our service area we target 45–50 minutes from order confirmation to your door. The exact estimate depends on your zone, current courier capacity and distance — and is always shown before you place the order.",
  },
  {
    q: "Which areas do you deliver to?",
    a: "We launch inside a deliberately small service area and publish exact zones on the Delivery page and at checkout. As our operation reliably holds the delivery target, we expand zone by zone.",
  },
  {
    q: "What payment methods are available?",
    a: "Cash on Delivery is the primary option at launch — you pay when your order arrives. bKash, Nagad and card payments will be added through a payment gateway in a later phase.",
  },
  {
    q: "Do I need an account to order?",
    a: "No. Checkout works without an account. You can also track any order with just your order ID and phone number.",
  },
  {
    q: "How do I track my order?",
    a: "Visit the Track page and enter the order ID from your confirmation message plus your phone number. You will see the live timeline: placed → confirmed → preparing → courier assigned → out for delivery → delivered.",
  },
  {
    q: "What is your return and exchange policy?",
    a: "Unworn items with original tags can be returned or exchanged within 7 days of delivery. Some items, such as innerwear and items marked final sale, are excluded. See the Returns & Exchange page for details.",
  },
  {
    q: "How do you keep quality trustworthy?",
    a: "Every product is quality-checked before dispatch, descriptions state real fabric and fit details, and prices include VAT. If something is not right, our support team makes it right.",
  },
  {
    q: "Will PROSANTI sell more than clothing?",
    a: "Yes — the platform is designed to grow beyond its first category into lifestyle, home and other products over time, without rebuilding the store.",
  },
];

export default function FaqPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:py-16">
      <Eyebrow>Answers, honestly</Eyebrow>
      <h1 className="font-display mt-3 text-4xl font-medium tracking-tight text-forest-900 sm:text-5xl">
        Frequently asked questions
      </h1>
      <p className="mt-4 leading-7 text-ink-soft">
        If you cannot find your answer here,{" "}
        <Link href="/contact" className="font-medium text-forest-700 underline underline-offset-4">
          contact support
        </Link>{" "}
        — we reply quickly during support hours.
      </p>

      <div className="mt-10 divide-y divide-line border-y border-line">
        {FAQS.map((faq) => (
          <details key={faq.q} className="group py-2">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 text-[1.02rem] font-medium text-ink [&::-webkit-details-marker]:hidden">
              {faq.q}
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ivory-100 text-forest-800 ring-1 ring-line transition-transform group-open:rotate-45">
                +
              </span>
            </summary>
            <p className="pb-6 pr-10 text-[0.95rem] leading-7 text-ink-soft">
              {faq.a}
            </p>
          </details>
        ))}
      </div>
    </div>
  );
}
