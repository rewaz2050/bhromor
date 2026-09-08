import type { Metadata } from "next";
import CartView from "@/components/cart/cart-view";
import { Eyebrow } from "@/components/ui/primitives";

export const metadata: Metadata = {
  title: "Cart",
  description: "Review your PROSANTI cart — quantities, delivery and total before checkout.",
};

export default function CartPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
      <Eyebrow>Your selection</Eyebrow>
      <h1 className="font-display mt-3 text-4xl font-medium tracking-tight text-forest-900 sm:text-5xl">
        Cart
      </h1>
      <div className="mt-10">
        <CartView />
      </div>
    </div>
  );
}
