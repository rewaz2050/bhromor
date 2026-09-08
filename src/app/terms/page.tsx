import type { Metadata } from "next";
import Link from "next/link";
import { Eyebrow } from "@/components/ui/primitives";

export const metadata: Metadata = {
  title: "Terms & Conditions",
  description: "Terms and conditions for using the PROSANTI store and services.",
};

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:py-16">
      <Eyebrow>Clear rules</Eyebrow>
      <h1 className="font-display mt-3 text-4xl font-medium tracking-tight text-forest-900 sm:text-5xl">
        Terms &amp; conditions
      </h1>
      <p className="mt-3 text-sm text-ink-soft">Last updated: September 2026</p>

      <div className="prose-prosanti mt-8">
        <p>
          By using prosanti.store you agree to these terms. They keep shopping
          fair and honest for everyone.
        </p>

        <h2>Orders &amp; pricing</h2>
        <ul>
          <li>
            Product prices are shown in Bangladeshi Taka (৳) and include VAT.
            Delivery charges are zone-based and displayed before you confirm.
          </li>
          <li>
            An order is confirmed when we accept it and send the confirmation.
            We may cancel an order if an item is unavailable, the address is
            outside the service area, or payment cannot be collected.
          </li>
          <li>
            Product images are representative; descriptions state real fabric,
            fit and care details.
          </li>
        </ul>

        <h2>Delivery</h2>
        <ul>
          <li>
            The 45–50 minute window is a service target inside the operating
            area, not a guarantee for every circumstance. Estimates shown at
            checkout are honest and zone-based.
          </li>
          <li>
            Please ensure someone is available at the delivery address and that
            the phone number provided is correct.
          </li>
        </ul>

        <h2>Payment</h2>
        <p>
          Cash on Delivery is the primary method at launch: pay the rider the
          exact total on delivery. Future online payment methods will be
          governed by the applicable gateway terms.
        </p>

        <h2>Returns &amp; accountability</h2>
        <p>
          Returns and exchanges follow the{" "}
          <Link href="/returns">Returns &amp; Exchange policy</Link>. We are
          responsible for items that arrive damaged or incorrect and will
          replace or refund them promptly.
        </p>

        <h2>Content &amp; conduct</h2>
        <ul>
          <li>
            All content on this site (text, images, brand marks) belongs to
            PROSANTI and may not be reused without permission.
          </li>
          <li>
            You agree not to misuse the site, attempt unauthorised access, or
            submit false information.
          </li>
        </ul>

        <h2>Limits of liability</h2>
        <p>
          Our liability is limited to the value of the products ordered. To the
          extent permitted by law, we are not liable for indirect losses
          arising from use of the site or delays outside our reasonable
          control.
        </p>

        <h2>Changes &amp; contact</h2>
        <p>
          We may update these terms; the latest version is always on this page.
          Questions? See the{" "}
          <Link href="/contact">Contact page</Link>.
        </p>
      </div>
    </div>
  );
}
