import type { Metadata } from "next";
import WishlistView from "@/components/wishlist/wishlist-view";
import { Eyebrow } from "@/components/ui/primitives";

export const metadata: Metadata = {
  title: "Wishlist",
  description:
    "Your saved PROSANTI products — the pieces you are thinking about, in one calm place.",
};

export default function WishlistPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
      <Eyebrow>Saved for later</Eyebrow>
      <h1 className="font-display mt-3 text-4xl font-medium tracking-tight text-forest-900 sm:text-5xl">
        Wishlist
      </h1>
      <p className="mt-4 max-w-2xl leading-7 text-ink-soft">
        Products you marked with a heart live here on this device — no account
        needed. When you are ready, add them to your cart.
      </p>
      <div className="mt-10">
        <WishlistView />
      </div>
    </div>
  );
}
