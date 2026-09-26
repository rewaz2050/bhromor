"use client";

/**
 * Round 4 (2026-09-26) — the "get your shop ready" card on the vendor
 * dashboard. Disappears once every step is done; until then it lists what
 * is missing with a link straight to the page that fixes it. The "open the
 * shop" step flips the existing dashboard toggle instead of navigating.
 */

import Link from "next/link";
import type { Product, Shop } from "@/lib/catalog";
import { checklistProgress, vendorChecklist } from "@/lib/vendor-onboarding";
import { IconCheck } from "@/components/ui/icons";

export default function OnboardingChecklist({
  shop,
  products,
  loading,
  onOpenShop,
  opening,
}: {
  shop: Shop;
  products: Product[];
  /** Products still loading — do not flash "0 products" at a busy shop. */
  loading: boolean;
  onOpenShop: () => void;
  opening: boolean;
}) {
  if (loading) return null;
  const steps = vendorChecklist(shop, products);
  const progress = checklistProgress(steps);
  if (progress.complete) return null;

  return (
    <section
      aria-labelledby="vendor-onboarding-heading"
      className="rounded-2xl bg-gold-100/50 p-5 ring-1 ring-gold-300"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="vendor-onboarding-heading" className="font-display text-lg text-forest-900">
          Get your shop ready
        </h2>
        <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-forest-900 ring-1 ring-gold-300">
          {progress.done}/{progress.total} done
        </span>
      </div>
      <div
        className="mt-3 h-2 overflow-hidden rounded-full bg-white ring-1 ring-gold-200"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={progress.total}
        aria-valuenow={progress.done}
        aria-label="Shop setup progress"
      >
        <div
          className="h-full rounded-full bg-forest-800 transition-[width] duration-500 motion-reduce:transition-none"
          style={{ width: `${(progress.done / progress.total) * 100}%` }}
        />
      </div>
      <ol className="mt-4 space-y-2">
        {steps.map((step) => (
          <li
            key={step.id}
            className={`flex flex-wrap items-center gap-3 rounded-xl px-3 py-2.5 ring-1 ${
              step.done ? "bg-white/60 ring-line" : "bg-white ring-gold-300"
            }`}
          >
            <span
              aria-hidden="true"
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                step.done ? "bg-emerald-600 text-white" : "bg-ivory-200 text-ink-soft"
              }`}
            >
              {step.done ? <IconCheck className="h-3.5 w-3.5" /> : ""}
            </span>
            <div className="min-w-0 flex-1">
              <p className={`text-sm font-semibold ${step.done ? "text-ink-soft line-through decoration-ink-soft/50" : "text-forest-900"}`}>
                {step.title}
                <span className="sr-only">{step.done ? " — done" : " — to do"}</span>
              </p>
              {!step.done && <p className="text-xs text-ink-soft">{step.detail}</p>}
            </div>
            {!step.done &&
              (step.href ? (
                <Link
                  href={step.href}
                  className="inline-flex min-h-11 items-center rounded-full bg-forest-800 px-4 text-xs font-semibold text-white hover:bg-forest-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest-800 focus-visible:ring-offset-2"
                >
                  {step.cta} →
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={onOpenShop}
                  disabled={opening}
                  className="inline-flex min-h-11 items-center rounded-full bg-forest-800 px-4 text-xs font-semibold text-white hover:bg-forest-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest-800 focus-visible:ring-offset-2 disabled:opacity-60"
                >
                  {opening ? "Opening…" : step.cta}
                </button>
              ))}
          </li>
        ))}
      </ol>
    </section>
  );
}
