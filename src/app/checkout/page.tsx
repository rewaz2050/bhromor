import type { Metadata } from "next";
import CheckoutView from "@/components/checkout/checkout-view";
import { Eyebrow } from "@/components/ui/primitives";

export const metadata: Metadata = {
  title: "Checkout",
  description:
    "Fast PROSANTI checkout — delivery area, charge and arrival estimate, cash on delivery.",
};

export default function CheckoutPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
      <Eyebrow>Almost there</Eyebrow>
      <h1 className="font-display mt-3 text-4xl font-medium tracking-tight text-forest-900 sm:text-5xl">
        Checkout
      </h1>
      <p className="mt-4 max-w-2xl leading-7 text-ink-soft">
        A short form, an honest delivery estimate, and cash on delivery. No
        account required.
      </p>
      <div className="mt-10">
        <CheckoutView />
      </div>
    </div>
  );
}
