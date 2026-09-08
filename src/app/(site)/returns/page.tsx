import type { Metadata } from "next";
import Link from "next/link";
import { Eyebrow } from "@/components/ui/primitives";

export const metadata: Metadata = {
  title: "Returns & Exchange",
  description: "PROSANTI return and exchange policy — 7-day returns on unworn items, easy process.",
};

const STEPS = [
  {
    title: "Request",
    text: "Contact support (phone, WhatsApp or the contact form) within 7 days of delivery with your order ID and the item you wish to return or exchange.",
  },
  {
    title: "Review",
    text: "We confirm eligibility — items must be unworn, unwashed, with original tags and packaging. Certain items are excluded (see below).",
  },
  {
    title: "Pickup & resolve",
    text: "Our rider collects the item during a scheduled window, or we guide you to the nearest drop point. Exchange ships on arrival; refunds (where applicable) are processed within 3–5 working days.",
  },
];

export default function ReturnsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:py-16">
      <Eyebrow>Easy, fair, clear</Eyebrow>
      <h1 className="font-display mt-3 text-4xl font-medium tracking-tight text-forest-900 sm:text-5xl">
        Returns &amp; exchange
      </h1>
      <p className="mt-4 leading-7 text-ink-soft">
        We want the fit and feel to be right. If it is not, you have 7 days
        from delivery to request a return or exchange on most items.
      </p>

      <ol className="mt-10 space-y-6">
        {STEPS.map((step, index) => (
          <li key={step.title} className="flex gap-5 rounded-3xl bg-paper p-6 ring-1 ring-line">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-forest-800 font-display text-lg font-semibold text-ivory-50">
              {index + 1}
            </span>
            <div>
              <h2 className="font-display text-xl font-medium text-forest-900">
                {step.title}
              </h2>
              <p className="mt-2 text-sm leading-7 text-ink-soft">{step.text}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className="prose-prosanti mt-12">
        <h2>Policy notes</h2>
        <ul>
          <li>
            Return window: <strong>7 days from delivery</strong>.
          </li>
          <li>
            Items must be unworn, unwashed, undamaged, with original tags and
            packaging.
          </li>
          <li>
            <strong>Not eligible:</strong> innerwear, and items marked “Final
            sale” — these are noted on the product page.
          </li>
          <li>
            Size exchanges ship free inside the service area when the requested
            size is in stock.
          </li>
          <li>
            If a product arrives damaged or incorrect, tell us within 48 hours
            with a photo — we replace it or refund promptly.
          </li>
          <li>
            Cash-on-delivery orders can be refunded to bKash or bank transfer
            once online payments are enabled; during launch, exchanges are the
            fastest resolution.
          </li>
        </ul>
        <h2>Start a return</h2>
        <p>
          The fastest way is WhatsApp or a phone call — both are listed on the{" "}
          <Link href="/contact">Contact page</Link>. Have your order ID ready.
        </p>
      </div>
    </div>
  );
}
