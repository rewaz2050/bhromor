"use client";

/**
 * Complete-the-Look as a purchasable set (P0 #2).
 *
 * foodpanda has no "combo" because a biryani does not need a partner. A
 * panjabi does — pajama, gamcha, a cap for Eid. So the editorial rail becomes
 * one tap: the anchor plus its complements, sized from the shopper's Size
 * Finder profile, at a set price below the sum of the parts.
 *
 * Nothing here is a promise the checkout cannot keep: the discount is derived
 * from the same settings document by `matchBundle()` (lib/promos.ts) when the
 * order is validated, so removing one piece simply removes the saving.
 */

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import type { Product } from "@/lib/catalog";
import { coverImage } from "@/lib/catalog";
import { formatBdt } from "@/lib/format";
import { BUNDLE_DEFAULTS, buildBundleOffer, matchBundle, type BundleConfig } from "@/lib/promos";
import { recommendedSizeFor, variantLabelFor } from "@/lib/size-finder";
import { useLiveCatalog } from "@/lib/use-live-catalog";
import { usePromos } from "@/lib/use-promos";
import { useSizeProfile } from "@/lib/use-size-profile";
import { useGuardedAdd } from "@/lib/use-guarded-add";
import { useCart } from "@/components/cart/cart-provider";
import ShopConflictDialog from "@/components/cart/shop-conflict-dialog";
import { Eyebrow } from "@/components/ui/primitives";
import { IconArrowRight, IconCheck, IconTag } from "@/components/ui/icons";
import { useLanguage } from "@/components/i18n/language-provider";

const bundleConfigOf = (partial: Partial<BundleConfig> | undefined): BundleConfig => ({
  ...BUNDLE_DEFAULTS,
  ...(partial ?? {}),
});

export default function BundleOffer({ product }: { product: Product }) {
  const { t } = useLanguage();
  const { products } = useLiveCatalog();
  const { promos } = usePromos();
  const { profile } = useSizeProfile();
  const { add, conflict, confirmConflict, dismissConflict } = useGuardedAdd("bundle");
  const { openBag } = useCart();
  const [justAdded, setJustAdded] = useState(false);

  const cfg = useMemo(() => bundleConfigOf(promos.bundle), [promos.bundle]);
  const offer = useMemo(() => buildBundleOffer(product, products, cfg), [product, products, cfg]);

  const pieces = useMemo(
    () =>
      (offer?.lines ?? []).map((line) => ({
        ...line,
        size: recommendedSizeFor(line.product, profile),
        variantLabel: variantLabelFor(line.product, recommendedSizeFor(line.product, profile)),
      })),
    [offer, profile],
  );

  if (!offer) return null;

  const addSet = () => {
    let allIn = true;
    for (const line of pieces) {
      if (!add(line.product, line.variantLabel, 1)) allIn = false;
    }
    if (allIn) {
      setJustAdded(true);
      openBag();
    }
  };

  return (
    <section
      aria-labelledby="bundle-offer-heading"
      data-testid="bundle-offer"
      className="mt-20 overflow-hidden rounded-2xl border border-gold-300/70 bg-gradient-to-br from-gold-50/70 via-paper to-ivory-100"
    >
      <div className="grid gap-8 p-6 sm:p-10 lg:grid-cols-[1fr_auto] lg:items-center">
        <div className="min-w-0">
          <Eyebrow>{t("bundle.eyebrow")}</Eyebrow>
          <h2
            id="bundle-offer-heading"
            className="mt-2 font-display text-3xl leading-tight text-forest-900 sm:text-4xl"
          >
            {t("bundle.setName").replace("{name}", cfg.name)} ·{" "}
            {t("bundle.pieces").replace("{n}", String(offer.lines.length))}
          </h2>
          <p className="mt-3 max-w-xl text-sm leading-7 text-ink-soft">{t("bundle.oneClick")}</p>

          <ul className="mt-6 grid gap-3 sm:grid-cols-2">
            {pieces.map((line) => (
              <li key={line.product.id} className="flex items-center gap-3 rounded-xl bg-paper/80 p-2.5 ring-1 ring-line">
                <span className="relative h-14 w-12 shrink-0 overflow-hidden rounded-md bg-ivory-100">
                  <Image
                    src={coverImage(line.product).src}
                    alt=""
                    fill
                    sizes="48px"
                    className="object-cover"
                  />
                </span>
                <span className="min-w-0 flex-1">
                  <Link
                    href={`/product/${line.product.slug}`}
                    className="block truncate text-sm font-medium text-forest-900 hover:underline"
                  >
                    {line.product.name}
                  </Link>
                  <span className="block truncate text-xs text-ink-soft">
                    {line.product.subCategory}
                    {line.size ? ` · ${line.size}` : ""} · {formatBdt(line.product.price)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="shrink-0 rounded-xl bg-forest-950 p-6 text-ivory-50 lg:w-72">
          <p className="text-[0.66rem] font-semibold uppercase tracking-[0.22em] text-gold-300">
            {t("bundle.setPrice")}
          </p>
          <p className="mt-2 flex items-baseline gap-2">
            <span className="font-display text-3xl">{formatBdt(offer.bundlePrice)}</span>
            <span className="text-sm text-ivory-100/60 line-through">{formatBdt(offer.listPrice)}</span>
          </p>
          <p className="mt-1 inline-flex items-center gap-1.5 text-xs font-medium text-gold-200">
            <IconTag className="h-3.5 w-3.5" />
            {t("bundle.save").replace("{amount}", formatBdt(offer.discount))}
          </p>
          <button
            type="button"
            onClick={addSet}
            className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-sm bg-gold-500 px-4 text-sm font-semibold text-forest-950 transition-colors hover:bg-gold-400"
          >
            {justAdded ? (
              <>
                <IconCheck className="h-4 w-4" />{" "}
                {t("bundle.addedSet").replace("{n}", String(offer.lines.length))}
              </>
            ) : (
              <>
                {t("bundle.addSet")} <IconArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
          <Link
            href="/shop"
            className="mt-3 block text-center text-xs text-ivory-100/70 underline-offset-4 hover:text-gold-200 hover:underline"
          >
            {t("bundle.separately")}
          </Link>
        </div>
      </div>

      {conflict && (
        <ShopConflictDialog
          fromShop={conflict.fromShopName}
          toShop={conflict.toShopName}
          onKeep={() => dismissConflict()}
          onStartNew={() => {
            confirmConflict();
            setJustAdded(true);
            openBag();
          }}
        />
      )}
    </section>
  );
}

/**
 * The bag's own line: "your set is complete, the shop will honour it".
 * Rendered by the cart page and the bag drawer with the same matcher the
 * checkout uses, so nobody is surprised at payment.
 */
export function BundleCartNote({
  lines,
}: {
  lines: { product: Product; qty: number }[];
}) {
  const { products } = useLiveCatalog();
  const { promos } = usePromos();
  const { t } = useLanguage();
  const cfg = useMemo(() => bundleConfigOf(promos.bundle), [promos.bundle]);
  // matchBundle already requires every piece to be in the bag, so a half set
  // says nothing at all.
  const offer = useMemo(() => matchBundle(lines, products, cfg), [lines, products, cfg]);
  if (!offer) return null;
  return (
    <p
      data-testid="bundle-cart-note"
      className="flex items-center gap-2 rounded-xl bg-forest-100 px-3 py-2 text-xs font-medium text-forest-900"
    >
      <IconTag className="h-3.5 w-3.5 text-gold-700" />
      {t("bundle.completeNote")
        .replace("{name}", cfg.name)
        .replace("{amount}", formatBdt(offer.discount))}
    </p>
  );
}
