import type { Metadata } from "next";
import CheckoutView from "@/components/checkout/checkout-view";
import CheckoutPageHeader from "@/components/checkout/checkout-page-header";

export const metadata: Metadata = {
  title: "Checkout",
  description:
    "Fast PROSANTI checkout — delivery area, charge and arrival estimate, cash on delivery.",
};

export default function CheckoutPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
      <CheckoutPageHeader />
      <div className="mt-10">
        <CheckoutView />
      </div>
    </div>
  );
}
