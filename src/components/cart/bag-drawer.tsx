"use client";

import { PRODUCTS } from "@/lib/catalog";
import { completeTheLook } from "@/lib/merchandising";
import Image from "next/image";
import Link from "next/link";
import Drawer from "@/components/ui/drawer";
import { useCart } from "./cart-provider";
import { MAX_LINE_QTY } from "@/lib/cart";
import { formatBdt } from "@/lib/format";
import {
  amountToFreeDelivery,
  FREE_DELIVERY_THRESHOLD,
} from "@/lib/delivery";
import { IconBag, IconClose } from "@/components/ui/icons";

export default function BagDrawer() {
  const {
    bagOpen,
    closeBag,
    detail,
    itemCount,
    subtotal,
    updateQty,
    removeItem,
  } = useCart();
  const recommendations = Array.from(
    new Map(
      detail
        .flatMap((line) => completeTheLook(line.product, PRODUCTS))
        .filter(
          (product) => !detail.some((line) => line.productId === product.id),
        )
        .map((product) => [product.id, product]),
    ).values(),
  ).slice(0, 2);
  const remaining = amountToFreeDelivery(subtotal);
  return (
    <Drawer
      open={bagOpen}
      onClose={closeBag}
      label="Your Bag"
      side="right"
      panelClassName="!w-full !max-w-md"
    >
      <div className="flex items-center justify-between border-b border-line px-6 py-5">
        <h2 className="font-display text-3xl text-forest-900">
          Your Bag{" "}
          <span className="font-sans text-sm text-ink-soft">({itemCount})</span>
        </h2>
        <button
          type="button"
          onClick={closeBag}
          aria-label="Close bag"
          className="flex h-11 w-11 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-forest-100 hover:text-forest-900"
        >
          <IconClose />
        </button>
      </div>
      {detail.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-5 p-8 text-center">
          <IconBag className="h-10 w-10 text-gold-600" />
          <h3 className="font-display text-3xl">Your bag is empty.</h3>
          <p className="text-sm text-ink-soft">
            Find a little everyday comfort in our collection.
          </p>
          <Link
            href="/shop"
            onClick={closeBag}
            className="editorial-button bg-forest-800 text-white"
          >
            Start shopping
          </Link>
        </div>
      ) : (
        <>
          <div className="border-b border-line bg-forest-50 px-6 py-4">
            <p className="text-sm text-forest-900" role="status">
              {remaining ? (
                <>
                  <strong className="font-semibold">
                    {formatBdt(remaining)}
                  </strong>{" "}
                  away from free delivery.
                </>
              ) : (
                <>
                  <strong className="font-semibold">
                    Free delivery unlocked.
                  </strong>{" "}
                  Enjoy it.
                </>
              )}
            </p>
            <div
              className="free-delivery-track mt-3"
              role="progressbar"
              aria-label="Progress towards free delivery"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.min(
                100,
                Math.round((subtotal / FREE_DELIVERY_THRESHOLD) * 100),
              )}
            >
              <div
                className="free-delivery-fill"
                style={{
                  width: `${Math.min(
                    100,
                    Math.round((subtotal / FREE_DELIVERY_THRESHOLD) * 100),
                  )}%`,
                }}
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-6">
            {detail.map(({ product, variantLabel, qty, lineTotal }) => (
              <article
                key={`${product.id}-${variantLabel}`}
                className="flex gap-4 border-b border-line py-6"
              >
                <Link
                  href={`/product/${product.slug}`}
                  onClick={closeBag}
                  className="relative h-32 w-24 shrink-0 bg-ivory-100"
                >
                  <Image
                    src={product.media[0]?.src ?? "/images/hero.jpg"}
                    alt={product.name}
                    fill
                    sizes="96px"
                    className="object-cover"
                  />
                </Link>
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/product/${product.slug}`}
                    onClick={closeBag}
                    className="font-display text-lg"
                  >
                    {product.name}
                  </Link>
                  <p className="mt-1 text-xs text-ink-soft">{variantLabel}</p>
                  <p className="mt-2 text-sm font-medium">
                    {formatBdt(lineTotal)}
                  </p>
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <div className="qty-stepper">
                      <button
                        type="button"
                        className="text-base leading-none"
                        aria-label={`Decrease ${product.name} quantity`}
                        disabled={qty <= 1}
                        onClick={() =>
                          updateQty(product.id, variantLabel, qty - 1)
                        }
                      >
                        −
                      </button>
                      <span>{qty}</span>
                      <button
                        type="button"
                        className="text-base leading-none"
                        aria-label={`Increase ${product.name} quantity`}
                        disabled={qty >= MAX_LINE_QTY}
                        onClick={() =>
                          updateQty(product.id, variantLabel, qty + 1)
                        }
                      >
                        +
                      </button>
                    </div>
                    <button
                      type="button"
                      className="min-h-11 px-1 text-xs text-ink-soft underline decoration-line underline-offset-4 transition-colors hover:text-forest-800"
                      aria-label={`Remove ${product.name}`}
                      onClick={() => removeItem(product.id, variantLabel)}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
          {recommendations.length > 0 && (
            <section
              aria-label="Pair it with"
              className="border-t border-line px-6 py-5"
            >
              <h3 className="mb-4 font-display text-xl text-forest-900">
                Pair it with
              </h3>
              <div className="grid grid-cols-2 gap-4">
                {recommendations.map((product) => (
                  <Link
                    key={product.id}
                    href={`/product/${product.slug}`}
                    onClick={closeBag}
                    className="group"
                  >
                    <div className="relative aspect-square overflow-hidden bg-ivory-100">
                      <Image
                        src={product.media[0]?.src ?? "/images/hero.jpg"}
                        alt={product.name}
                        fill
                        sizes="180px"
                        className="object-cover transition-transform group-hover:scale-[1.03]"
                      />
                    </div>
                    <p className="mt-2 font-display text-base">
                      {product.name}
                    </p>
                    <p className="mt-1 text-xs text-ink-soft">
                      {formatBdt(product.price)} · View details →
                    </p>
                  </Link>
                ))}
              </div>
            </section>
          )}
          <div className="border-t border-line bg-ivory-100/70 p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-ink-soft">Subtotal</span>
              <strong className="font-display text-2xl text-forest-900">
                {formatBdt(subtotal)}
              </strong>
            </div>
            <p className="mb-5 mt-1.5 text-xs text-ink-soft">
              {remaining
                ? "Area-based delivery charge shown at checkout."
                : "Delivery is free within available service areas."}
            </p>
            <Link
              href="/checkout"
              onClick={closeBag}
              className="editorial-button w-full justify-center bg-forest-800 text-white"
            >
              Checkout →
            </Link>
            <Link
              href="/cart"
              onClick={closeBag}
              className="mt-3 flex min-h-11 items-center justify-center border border-line text-xs uppercase tracking-widest text-ink-soft transition-colors hover:border-forest-400 hover:text-forest-800"
            >
              View bag
            </Link>
            <p className="mt-4 text-center text-xs text-ink-soft">
              Cash on delivery · Quality checked
            </p>
          </div>
        </>
      )}
    </Drawer>
  );
}
