import type { Metadata } from "next";
import WishlistView from "@/components/wishlist/wishlist-view";
import WishlistPageHeader from "@/components/wishlist/wishlist-page-header";

export const metadata: Metadata = {
  title: "Wishlist",
  description:
    "Your saved PROSANTI products — the pieces you are thinking about, in one calm place.",
};

export default function WishlistPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
      <WishlistPageHeader />
      <div className="mt-10">
        <WishlistView />
      </div>
    </div>
  );
}
