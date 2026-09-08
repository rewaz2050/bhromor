"use client";

import Link from "next/link";
import Image from "next/image";
import { useCart } from "./cart-provider";
import { useZones } from "@/lib/use-zones";
import { formatBdt } from "@/lib/format";
import {
  DELIVERY_ETA,
  FREE_DELIVERY_THRESHOLD,
  INSTANT_DELIVERY_TITLE,
  amountToFreeDelivery,
  cheapestZoneCharge,
  deliveryChargeFor,
  orderTotal,
} from "@/lib/delivery";
import { FLAT_DELIVERY_NOTE } from "@/lib/catalog";
import { MAX_LINE_QTY } from "@/lib/cart";
import { ButtonLink } from "@/components/ui/primitives";
import {
  IconArrowRight,
  IconBag,
  IconMinus,
  IconPlus,
  IconTrash,
  IconTruck,
} from "@/components/ui/icons";

export default function CartView() {
  const { detail, updateQty, removeItem, subtotal } = useCart();
  /** Real zone pricing (shared with checkout) instead of a hardcoded fee. */
  const { activeZones } = useZones();
  const itemCount = detail.reduce((n, l) => n + l.qty, 0);
  const empty = detail.length === 0;

  if (empty) {
    return (
      <div className="flex flex-col items-center px-6 py-24 text-center">
        <span className="flex h-20 w-20 items-center justify-center rounded-full bg-ivory-100 text-forest-700 ring-1 ring-line">
          <IconBag className="h-9 w-9" />
        </span>
        <h1 className="font-display mt-8 text-3xl font-medium text-forest-900">
          Your cart is empty
        </h1>
        <p className="mt-3 max-w-sm text-ink-soft">
          Discover something you may love — our catalog is small, curated and
          delivered fast.
        </p>
        <div className="mt-8">
          <ButtonLink href="/shop" size="lg">
            Explore products <IconArrowRight className="h-4 w-4" />
          </ButtonLink>
        </div>
      </div>
    );
  }

  const fromCharge = cheapestZoneCharge(activeZones);
  const deliveryFee = deliveryChargeFor(fromCharge, subtotal);
  const freeDelivery = deliveryFee === 0;
  const missingForFree = amountToFreeDelivery(subtotal);
  const total = orderTotal(subtotal, deliveryFee);

  return (
    <div className="grid gap-12 lg:grid-cols-[1fr_380px]">
      {/* Lines */}
      <div>
        <ul className="divide-y divide-line border-y border-line">
          {detail.map((line) => {
            const { product } = line;
            return (
              <li key={product.id + line.variantLabel} className="flex gap-5 py-6">
                <Link
                  href={`/product/${product.slug}`}
                  className="relative block aspect-[4/5] w-24 shrink-0 overflow-hidden rounded-xl bg-ivory-100 ring-1 ring-line sm:w-28"
                >
                  <Image
                    src={product.media[0].src}
                    alt={product.media[0].alt}
                    fill
                    sizes="112px"
                    className="object-cover"
                  />
                </Link>
                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-[0.68rem] font-medium uppercase tracking-[0.2em] text-ink-soft">
                        {product.subCategory}
                      </p>
                      <Link
                        href={`/product/${product.slug}`}
                        className="font-display mt-1 block truncate text-lg font-medium text-ink transition-colors hover:text-forest-700"
                      >
                        {product.name}
                      </Link>
                      <p className="mt-1 text-xs text-ink-soft">
                        Variant: {line.variantLabel} · SKU {product.sku}
                      </p>
                    </div>
                    <p className="shrink-0 text-sm font-semibold text-ink">
                      {formatBdt(product.price * line.qty)}
                    </p>
                  </div>

                  <div className="mt-auto flex items-center justify-between pt-4">
                    <div className="flex h-11 items-center justify-between rounded-full bg-paper px-1.5 ring-1 ring-line">
                      <button
                        type="button"
                        onClick={() =>
                          updateQty(product.id, line.variantLabel, line.qty - 1)
                        }
                        aria-label={`Decrease quantity of ${product.name}`}
                        className="flex h-8 w-8 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-forest-100"
                      >
                        <IconMinus className="h-3.5 w-3.5" />
                      </button>
                      <span
                        className="w-8 text-center text-sm font-semibold text-ink"
                        aria-live="polite"
                      >
                        {line.qty}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          updateQty(product.id, line.variantLabel, line.qty + 1)
                        }
                        disabled={line.qty >= MAX_LINE_QTY}
                        aria-label={`Increase quantity of ${product.name}`}
                        title={
                          line.qty >= MAX_LINE_QTY
                            ? `Maximum ${MAX_LINE_QTY} per item`
                            : undefined
                        }
                        className="flex h-8 w-8 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-forest-100 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <IconPlus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        removeItem(product.id, line.variantLabel)
                      }
                      aria-label={`Remove ${product.name} from cart`}
                      className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm text-ink-soft transition-colors hover:bg-red-50 hover:text-red-700"
                    >
                      <IconTrash className="h-4 w-4" />
                      <span className="hidden sm:inline">Remove</span>
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>

        <div className="mt-6">
          <ButtonLink href="/shop" variant="ghost" size="sm" className="-ml-3">
            ← Continue shopping
          </ButtonLink>
        </div>
      </div>

      {/* Summary */}
      <aside>
        <div className="sticky top-28 rounded-3xl bg-paper p-8 ring-1 ring-line">
          <h2 className="font-display text-2xl font-medium text-forest-900">
            Order summary
          </h2>
          <p className="mt-2 flex items-center gap-2 text-sm font-semibold text-forest-800">
            <IconTruck className="h-4 w-4 shrink-0 text-gold-600" />
            {INSTANT_DELIVERY_TITLE} — arrives in {DELIVERY_ETA}
          </p>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-ink-soft">
                Subtotal ({itemCount} {itemCount === 1 ? "item" : "items"})
              </dt>
              <dd className="font-medium text-ink">{formatBdt(subtotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-soft">
                Delivery{!freeDelivery && " (from)"}
              </dt>
              <dd className="font-medium text-ink">
                {deliveryFee === 0 ? (
                  <span className="text-forest-700">Free</span>
                ) : (
                  formatBdt(deliveryFee)
                )}
              </dd>
            </div>
            {freeDelivery ? (
              <p className="rounded-xl bg-forest-100 px-3 py-2 text-xs text-forest-800">
                Free delivery unlocked on this order.
              </p>
            ) : (
              <p className="rounded-xl bg-ivory-100 px-3 py-2 text-xs text-ink-soft">
                Add {formatBdt(missingForFree)} more for free delivery. The
                exact charge depends on the area you pick at checkout.
              </p>
            )}
            <div className="flex justify-between border-t border-line pt-4 text-base">
              <dt className="font-semibold text-ink">
                {freeDelivery ? "Total" : "Estimated total"}
              </dt>
              <dd className="font-bold text-ink">{formatBdt(total)}</dd>
            </div>
          </dl>

          <ButtonLink
            href="/checkout"
            size="lg"
            className="mt-7 w-full"
          >
            Proceed to Checkout <IconArrowRight className="h-4 w-4" />
          </ButtonLink>
          <p className="mt-4 text-center text-xs leading-5 text-ink-soft">
            {INSTANT_DELIVERY_TITLE} · {DELIVERY_ETA}. Cash on delivery
            available.{" "}
            {!freeDelivery &&
              `Free delivery on orders over ${formatBdt(FREE_DELIVERY_THRESHOLD)}.`}
          </p>
          <p className="mt-4 border-t border-line pt-4 text-xs leading-5 text-ink-soft/80">
            {FLAT_DELIVERY_NOTE}
          </p>
        </div>
      </aside>
    </div>
  );
}
