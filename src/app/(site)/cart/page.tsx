import type { Metadata } from "next";
import CartView from "@/components/cart/cart-view";
import CartPageHeader from "@/components/cart/cart-page-header";

export const metadata: Metadata = {
  title: "Cart",
  description: "Review your PROSANTI cart — quantities, delivery and total before checkout.",
};

export default function CartPage() {
  /* UI/UX pass 2026-10-15 — phones carry a sticky checkout bar above the
     bottom nav, so the page reserves room for it; desktop keeps the old
     rhythm (the sticky summary aside is already there). */
  return (
    <div className="mx-auto max-w-7xl px-4 pb-44 pt-12 sm:px-6 lg:px-8 lg:pb-16 lg:pt-16">
      <CartPageHeader />
      <div className="mt-10">
        <CartView />
      </div>
    </div>
  );
}
