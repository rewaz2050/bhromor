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
  DELIVERY_ETA,
  FREE_DELIVERY_THRESHOLD,
  INSTANT_DELIVERY_TITLE,
} from "@/lib/delivery";
import { IconBag, IconClose, IconTruck } from "@/components/ui/icons";
import { useLanguage } from "@/components/i18n/language-provider";

export default function BagDrawer() {
  const { t } = useLanguage();
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
      label={t("bag.yourBag")}
      side="right"
      panelClassName="!w-full !max-w-md"
    >
      <div className="flex items-center justify-between border-b border-line px-6 py-5">
        <h2 className="font-display text-3xl text-forest-900">
          {t("bag.yourBag")}{" "}
          <span className="font-sans text-sm text-ink-soft">({itemCount})</span>
        </h2>
        <button
          type="button"
          onClick={closeBag}
          aria-label={t("bag.closeBag")}
          className="flex h-11 w-11 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-forest-100 hover:text-forest-900"
        >
          <IconClose />
        </button>
      </div>
      {detail.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-5 p-8 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-ivory-100 text-gold-600 ring-1 ring-line">
            <IconBag className="h-6 w-6" />
          </span>
          <h3 className="font-display text-3xl">{t("bag.bagEmpty")}</h3>
          <p className="max-w-sm text-sm leading-6 text-ink-soft">
            {t("bag.bagEmptyHint")}
          </p>
          <Link
            href="/shop"
            onClick={closeBag}
            className="editorial-button bg-forest-800 text-white"
          >
            {t("bag.startShopping")}
          </Link>
        </div>
      ) : (
        <>
          <div className="border-b border-line bg-forest-50 px-6 py-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-forest-900">
              <IconTruck className="h-4 w-4 shrink-0 text-gold-600" />
              {INSTANT_DELIVERY_TITLE} — arrives in {DELIVERY_ETA}
            </p>
            <p className="mt-1.5 text-xs text-ink-soft" role="status">
              {remaining
                ? `${formatBdt(remaining)} ${t("bag.moreForFreeDelivery")}`
                : t("bag.freeDeliveryUnlocked")}
            </p>
            <div
              className="free-delivery-track mt-2.5"
              role="progressbar"
              aria-label={t("bag.progressTowardsFreeDelivery")}
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
                        aria-label={`${t("product.decreaseQuantity")} ${product.name}`}
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
                        aria-label={`${t("product.increaseQuantity")} ${product.name}`}
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
                      aria-label={`${t("bag.remove")} ${product.name}`}
                      onClick={() => removeItem(product.id, variantLabel)}
                    >
                      {t("bag.remove")}
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
          {recommendations.length > 0 && (
            <section
              aria-label={t("bag.pairItWith")}
              className="border-t border-line px-6 py-5"
            >
              <h3 className="mb-4 font-display text-xl text-forest-900">
                {t("bag.pairItWith")}
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
                      {formatBdt(product.price)} · {t("bag.viewDetails")}
                    </p>
                  </Link>
                ))}
              </div>
            </section>
          )}
          <div className="border-t border-line bg-ivory-100/70 p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-ink-soft">{t("bag.subtotal")}</span>
              <strong className="font-display text-2xl text-forest-900">
                {formatBdt(subtotal)}
              </strong>
            </div>
            <p className="mb-5 mt-1.5 text-xs text-ink-soft">
              {INSTANT_DELIVERY_TITLE} · {DELIVERY_ETA} —{" "}
              {remaining
                ? "area-based charge shown at checkout."
                : t("bag.freeDeliveryUnlocked").toLowerCase()}
            </p>
            <Link
              href="/checkout"
              onClick={closeBag}
              className="editorial-button w-full justify-center bg-forest-800 text-white"
            >
              {t("bag.checkout")}
            </Link>
            <Link
              href="/cart"
              onClick={closeBag}
              className="mt-3 flex min-h-11 items-center justify-center border border-line text-xs uppercase tracking-widest text-ink-soft transition-colors hover:border-forest-400 hover:text-forest-800"
            >
              {t("bag.viewBag")}
            </Link>
            <p className="mt-4 text-center text-xs text-ink-soft">
              {t("bag.cashQuality")}
            </p>
          </div>
        </>
      )}
    </Drawer>
  );
}
