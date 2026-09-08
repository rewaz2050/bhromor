import type { Metadata } from "next";
import CartView from "@/components/cart/cart-view";
import CartPageHeader from "@/components/cart/cart-page-header";

export const metadata: Metadata = {
  title: "Cart",
  description: "Review your PROSANTI cart — quantities, delivery and total before checkout.",
};

export default function CartPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
      <CartPageHeader />
      <div className="mt-10">
        <CartView />
      </div>
    </div>
  );
}
