"use client";

import Link from "next/link";
import { useWishlist } from "@/lib/use-wishlist";
import { PRODUCTS } from "@/lib/catalog";
import ProductCard from "@/components/product/product-card";
import { IconHeart, IconTrash } from "@/components/ui/icons";

/** §29 wishlist — grid of saved products with an elegant empty state (§96). */
export default function WishlistView() {
  const { ids, clear, ready, busy, error, synced, retry } = useWishlist();
  const saved = PRODUCTS.filter((p) => ids.includes(p.id));

  if (!ready)
    return (
      <div
        className="border border-line bg-ivory-100 p-8"
        role={error ? "alert" : "status"}
      >
        <p className="text-sm text-ink-soft">
          {error || "Loading your account wishlist…"}
        </p>
        {error && (
          <button
            disabled={busy}
            onClick={() => void retry?.()}
            className="editorial-button mt-4 bg-forest-800 text-white"
          >
            Retry sync
          </button>
        )}
      </div>
    );
  if (saved.length === 0) {
    return (
      <div className="flex flex-col items-center rounded-3xl border border-dashed border-line bg-ivory-100/50 px-8 py-24 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-paper text-gold-500 ring-1 ring-line">
          <IconHeart className="h-7 w-7" />
        </span>
        <h2 className="font-display mt-6 text-2xl font-medium text-forest-900">
          Your wishlist is waiting.
        </h2>
        <p className="mt-2 max-w-sm text-sm leading-6 text-ink-soft">
          Tap the heart on any product you love — it will wait for you here.
          {synced
            ? " Saved to your account."
            : " Guest favourites are saved on this device."}
        </p>
        <Link
          href="/shop"
          className="mt-7 inline-flex h-12 items-center gap-2 rounded-full bg-forest-800 px-7 text-sm font-semibold text-ivory-50 transition-colors hover:bg-forest-700"
        >
          Explore Collection
        </Link>
        <Link href="/account" className="editorial-text-link mt-4">
          {synced
            ? "Manage account & import guest favourites"
            : "Sign in to sync across devices"}
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-ink-soft">
        {synced ? "Saved to your account." : "Saved on this device."}{" "}
        <Link href="/account" className="underline underline-offset-4">
          {synced ? "Manage account" : "Sign in to sync"}
        </Link>
      </p>
      <div className="flex items-center justify-between">
        <p className="text-sm text-ink-soft">
          {saved.length} saved product{saved.length === 1 ? "" : "s"}
        </p>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            if (window.confirm("Clear your whole wishlist?")) clear();
          }}
          className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold text-ink-soft ring-1 ring-line transition-colors hover:text-rose-700 hover:ring-rose-300"
        >
          <IconTrash className="h-3.5 w-3.5" /> Clear all
        </button>
      </div>
      <div className="grid grid-cols-2 gap-x-5 gap-y-10 md:grid-cols-3 xl:grid-cols-4">
        {saved.map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </div>
    </div>
  );
}
