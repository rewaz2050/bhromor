"use client";

import { useState } from "react";
import Link from "next/link";
import type { Product } from "@/lib/catalog";
import Drawer from "@/components/ui/drawer";
import { IconClose } from "@/components/ui/icons";

export function FitGuidance({ product }: { product: Product }) {
  const details = product.details.filter((d) =>
    /^(fit|size|length|includes|contents)$/i.test(d.label),
  );
  const oneSize =
    product.sizes.length === 1 && /^(free|one) size$/i.test(product.sizes[0]);
  return (
    <div className="text-sm leading-7 text-ink-soft">
      <p className="font-display text-xl text-forest-900">{product.name}</p>
      <p className="mt-3">
        Available sizes:{" "}
        <span className="font-medium text-forest-800">
          {product.sizes.join(" · ") || "Contact us for sizing"}
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
        <p className="mt-5">
          One size is a product label, not a guarantee of fit. Check the listed
          dimensions and confirm with us if you need a specific measurement.
        </p>
      ) : (
        <>
          <h3 className="mt-6 text-xs font-semibold uppercase tracking-widest text-forest-900">
            Before choosing your size
          </h3>
          <ol className="mt-3 list-decimal space-y-3 pl-5">
            <li>
              Lay a similar, well-fitting garment flat without stretching it.
            </li>
            <li>
              Measure across the chest, shoulder seam to seam, and from the
              highest shoulder point to the hem.
            </li>
            <li>
              Share those measurements and your preferred fit with our team
              before ordering.
            </li>
          </ol>
        </>
      )}
      <p className="mt-5 border-l-2 border-gold-400 bg-ivory-100 p-4 text-xs leading-6">
        A verified size-by-size measurement chart is not yet available for this
        item. We don’t substitute a generic chart because fit varies by garment.
      </p>
      <Link href="/contact" className="editorial-text-link mt-4">
        Ask us about fit →
      </Link>
    </div>
  );
}

/** Inline disclosure inside Quick Add avoids stacking two focus-trapping dialogs. */
export function InlineSizeGuide({ product }: { product: Product }) {
  return (
    <details className="mt-4 border-b border-line pb-3">
      <summary className="flex min-h-11 cursor-pointer items-center text-xs font-medium text-forest-800 underline underline-offset-4">
        Size &amp; fit guide
      </summary>
      <div className="pb-3 pt-2">
        <FitGuidance product={product} />
      </div>
    </details>
  );
}

export default function SizeGuide({ product }: { product: Product }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="min-h-11 text-xs font-medium text-forest-800 underline underline-offset-4"
      >
        Size Guide
      </button>
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        label="Size and fit guide"
        side="right"
        panelClassName="!w-full !max-w-lg p-6 sm:p-8"
      >
        <div className="mb-6 flex items-center justify-between gap-3">
          <h2 className="font-display text-3xl text-forest-900">
            A more considered fit.
          </h2>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close size guide"
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
