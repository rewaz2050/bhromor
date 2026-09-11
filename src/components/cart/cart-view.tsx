"use client";

import Link from "next/link";
import Image from "next/image";
import { useCart } from "./cart-provider";
import BagShopHeader from "./bag-shop-header";
import { useZones } from "@/lib/use-zones";
import { formatBdt } from "@/lib/format";
import {
  DELIVERY_ETA,
  FIRST_FREE_DELIVERY_LIMIT,
  INSTANT_DELIVERY_TITLE,
  cheapestZoneCharge,
} from "@/lib/delivery";
import { FLAT_DELIVERY_NOTE, coverImage } from "@/lib/catalog";
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
import { useLanguage } from "@/components/i18n/language-provider";

export default function CartView() {
  const { t } = useLanguage();
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
          {t("cart.yourCartIsEmpty")}
        </h1>
        <p className="mt-3 max-w-sm text-ink-soft">{t("cart.discoverHint")}</p>
        <div className="mt-8">
          <ButtonLink href="/shop" size="lg">
            {t("cart.exploreProducts")} <IconArrowRight className="h-4 w-4" />
          </ButtonLink>
        </div>
      </div>
    );
  }

  const fromCharge = cheapestZoneCharge(activeZones);
  const deliveryFee = fromCharge;
  // Marketing note — per-user promo; the real check happens at checkout/server.
  const promoFree = true;
  const total = subtotal;

  return (
    <div className="grid gap-12 lg:grid-cols-[1fr_380px]">
      {/* Lines */}
      <div>
        <div className="mb-5">
          <BagShopHeader />
        </div>
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
                    src={coverImage(product).src}
                    alt={coverImage(product).alt || product.name}
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
                        {t("cart.variant")} {line.variantLabel} · {t("cart.sku")} {product.sku}
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
                        aria-label={`${t("product.decreaseQuantity")} ${product.name}`}
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
                        aria-label={`${t("product.increaseQuantity")} ${product.name}`}
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
                      aria-label={`${t("cart.remove")} ${product.name} from cart`}
                      className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm text-ink-soft transition-colors hover:bg-red-50 hover:text-red-700"
                    >
                      <IconTrash className="h-4 w-4" />
                      <span className="hidden sm:inline">{t("cart.remove")}</span>
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>

        <div className="mt-6">
          <ButtonLink href="/shop" variant="ghost" size="sm" className="-ml-3">
            ← {t("cart.continueShopping")}
          </ButtonLink>
        </div>
      </div>

      {/* Summary */}
      <aside>
        <div className="sticky top-28 rounded-3xl bg-paper p-8 ring-1 ring-line">
          <h2 className="font-display text-2xl font-medium text-forest-900">
            {t("cart.orderSummary")}
          </h2>
          <p className="mt-2 flex items-center gap-2 text-sm font-semibold text-forest-800">
            <IconTruck className="h-4 w-4 shrink-0 text-gold-600" />
            {INSTANT_DELIVERY_TITLE} — Sunamganj Sadar · {DELIVERY_ETA}
          </p>
          <p className="mt-2 rounded-xl bg-gold-50 px-3 py-2 text-xs font-bold text-forest-900 ring-1 ring-gold-200">
            🎉 প্রতিটি কাস্টমারের প্রথম {FIRST_FREE_DELIVERY_LIMIT} অর্ডারে ফ্রি!
          </p>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-ink-soft">
                {t("cart.subtotal")} ({itemCount} {itemCount === 1 ? t("cart.item") : t("cart.items")})
              </dt>
              <dd className="font-medium text-ink">{formatBdt(subtotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-soft">{t("cart.deliveryFrom")}</dt>
              <dd className="font-medium text-ink">{formatBdt(deliveryFee)}</dd>
            </div>
            {promoFree ? (
              <p className="rounded-xl bg-forest-100 px-3 py-2 text-xs text-forest-800">
                {`🎉 প্রতিটি কাস্টমারের প্রথম ${FIRST_FREE_DELIVERY_LIMIT} অর্ডারে ডেলিভারি ফ্রি — শুধু সুনামগঞ্জ সিটি (এ জোন)-এ!`}
              </p>
            ) : (
              <p className="rounded-xl bg-ivory-100 px-3 py-2 text-xs text-ink-soft">
                {"ডেলিভারি চার্জ ঠিকানা অনুযায়ী চেকআউটে হিসাব হবে (জোন ৳৩০–৳১০০)।"}
              </p>
            )}
            <div className="flex justify-between border-t border-line pt-4 text-base">
              <dt className="font-semibold text-ink">
                {t("cart.estimatedTotal")}
              </dt>
              <dd className="font-bold text-ink">{formatBdt(total)}</dd>
            </div>
          </dl>

          <ButtonLink
            href="/checkout"
            size="lg"
            className="mt-7 w-full"
          >
            {t("cart.proceedToCheckout")} <IconArrowRight className="h-4 w-4" />
          </ButtonLink>
          <p className="mt-4 text-center text-xs leading-5 text-ink-soft">
            {INSTANT_DELIVERY_TITLE} · {DELIVERY_ETA}. Cash on delivery
            available.{" "}
            {`প্রতিটি কাস্টমারের প্রথম ${FIRST_FREE_DELIVERY_LIMIT}টি অর্ডারে ডেলিভারি ফ্রি (সুনামগঞ্জ সিটি এ জোন).`}
          </p>
          <p className="mt-4 border-t border-line pt-4 text-xs leading-5 text-ink-soft/80">
            {FLAT_DELIVERY_NOTE}
          </p>
        </div>
      </aside>
    </div>
  );
}
