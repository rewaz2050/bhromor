import type { Metadata } from "next";
import Link from "next/link";
import { Eyebrow } from "@/components/ui/primitives";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How PROSANTI collects, uses and protects your personal information.",
};

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:py-16">
      <Eyebrow>Your data, respected</Eyebrow>
      <h1 className="font-display mt-3 text-4xl font-medium tracking-tight text-forest-900 sm:text-5xl">
        Privacy policy
      </h1>
      <p className="mt-3 text-sm text-ink-soft">Last updated: September 2026</p>

      <div className="prose-prosanti mt-8">
        <p>
          PROSANTI (“we”, “us”) operates prosanti.store and provides commerce
          and local delivery services in Bangladesh. This policy explains what
          personal information we collect and why, and how we protect it.
        </p>

        <h2>Information we collect</h2>
        <ul>
          <li>
            <strong>Order details:</strong> name, phone number, delivery
            address and order notes — needed to confirm, deliver and support
            your order.
          </li>
          <li>
            <strong>Communication:</strong> messages you send through support
            channels.
          </li>
          <li>
            <strong>Technical:</strong> basic analytics such as pages viewed and
            device type, used to improve the experience. No payment-card data
            is handled by us at launch — Cash on Delivery is primary.
          </li>
        </ul>

        <h2>How we use it</h2>
        <ul>
          <li>To confirm, fulfil and deliver orders, and to show live status.</li>
          <li>To respond to support and return/exchange requests.</li>
          <li>
            To send order updates (SMS/WhatsApp where you have agreed and the
            channel is operationally enabled).
          </li>
          <li>To improve products, delivery performance and the website.</li>
        </ul>

        <h2>Sharing</h2>
        <p>
          We do not sell personal information. Delivery riders receive only the
          name, phone number and address needed to complete your delivery.
          Service providers (hosting, media, analytics, and in the future
          payment gateways) process data under our instruction with appropriate
          safeguards.
        </p>

        <h2>Location</h2>
        <p>
          Live courier location is collected only during an active delivery,
          shared only with the order’s customer, and stopped when delivery
          completes. Courier personal information is never exposed.
        </p>

        <h2>Retention &amp; your rights</h2>
        <p>
          Order records are kept as long as needed for operations, accounting
          and legal obligations. You may request a copy or deletion of your
          personal data by contacting us — see the{" "}
          <Link href="/contact">Contact page</Link>.
        </p>

        <h2>Contact</h2>
        <p>
          Questions about this policy: care@prosanti.store or 01700-000000.
        </p>
      </div>
    </div>
  );
}
