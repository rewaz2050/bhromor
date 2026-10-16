"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Product } from "@/lib/catalog";
import Drawer from "@/components/ui/drawer";
import { IconClose } from "@/components/ui/icons";
import { useLanguage } from "@/components/i18n/language-provider";

export function FitGuidance({ product }: { product: Product }) {
  const { t } = useLanguage();
  const details = product.details.filter((d) =>
    /^(fit|size|length|includes|contents)$/i.test(d.label),
  );
  const oneSize =
    product.sizes.length === 1 && /^(free|one) size$/i.test(product.sizes[0]);
  return (
    <div className="text-sm leading-7 text-ink-soft">
      <p className="font-display text-xl text-forest-900">{product.name}</p>
      <p className="mt-3">
        {t("sizeGuide.availableSizes")}{" "}
        <span className="font-medium text-forest-800">
          {product.sizes.join(" · ") || t("sizeGuide.noSizes")}
        </span>
      </p>
      {details.length > 0 && (
        <dl className="mt-5 divide-y divide-line border-y border-line">
          {details.map((detail) => (
            <div key={detail.label} className="flex justify-between gap-5 py-3">
              <dt>{detail.label}</dt>
              <dd className="text-right font-medium text-forest-900">
                {detail.value}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {oneSize ? (
        <p className="mt-5">{t("sizeGuide.oneSizeNote")}</p>
      ) : (
        <>
          <h3 className="mt-6 text-xs font-semibold uppercase tracking-widest text-forest-900">
            {t("sizeGuide.beforeTitle")}
          </h3>
          <ol className="mt-3 list-decimal space-y-3 pl-5">
            <li>{t("sizeGuide.step1")}</li>
            <li>{t("sizeGuide.step2")}</li>
            <li>{t("sizeGuide.step3")}</li>
          </ol>
        </>
      )}
      <p className="mt-5 border-l-2 border-gold-400 bg-ivory-100 p-4 text-xs leading-6">
        {t("sizeGuide.noChartNote")}
      </p>
      <Link href="/contact" className="editorial-text-link mt-4">
        {t("sizeGuide.askFit")}
      </Link>
    </div>
  );
}

/** Inline disclosure inside Quick Add avoids stacking two focus-trapping dialogs. */
export function InlineSizeGuide({ product }: { product: Product }) {
  const { t } = useLanguage();
  return (
    <details className="mt-4 border-b border-line pb-3">
      <summary className="flex min-h-11 cursor-pointer items-center text-xs font-medium text-forest-800 underline underline-offset-4">
        {t("sizeGuide.inlineSummary")}
      </summary>
      <div className="pb-3 pt-2">
        <FitGuidance product={product} />
      </div>
    </details>
  );
}

export default function SizeGuide({
  product,
  autoOpenKey,
}: {
  product: Product;
  /** Bump to open the drawer (stylist chat handoff). */
  autoOpenKey?: number;
}) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (autoOpenKey && autoOpenKey > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- deliberate signal from the stylist chat (its dialog is already closed)
      setOpen(true);
    }
  }, [autoOpenKey]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="min-h-11 text-xs font-medium text-forest-800 underline underline-offset-4"
      >
        {t("sizeGuide.button")}
      </button>
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        label={t("sizeGuide.drawerLabel")}
        side="right"
        panelClassName="!w-full !max-w-lg p-6 sm:p-8"
      >
        <div className="mb-6 flex items-center justify-between gap-3">
          <h2 className="font-display text-3xl text-forest-900">
            {t("sizeGuide.heading")}
          </h2>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label={t("sizeGuide.closeAria")}
            className="flex h-11 w-11 shrink-0 items-center justify-center"
          >
            <IconClose />
          </button>
        </div>
        <FitGuidance product={product} />
      </Drawer>
    </>
  );
}
