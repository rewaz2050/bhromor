"use client";

/**
 * "Add ৳150 more and delivery is free" — the bag's progress bar (2026-09-26).
 *
 * Renders nothing when no rule is armed for this shop, so the bag looks
 * exactly as before on a store that never opted in. The numbers come from
 * `useFreeDelivery` (the same helpers the checkout and the RPC price with),
 * never from this component.
 */

import Link from "next/link";
import { useLanguage } from "@/components/i18n/language-provider";
import { IconTruck } from "@/components/ui/icons";
import type { Shop } from "@/lib/catalog";
import { freeDeliveryAmount, useFreeDelivery } from "@/lib/use-free-delivery";

export default function FreeDeliveryBar({
  shop,
  subtotal,
  onNavigate,
  className = "",
  showKeepShopping = true,
}: {
  shop: Pick<Shop, "freeDeliveryMinPaisa" | "slug"> | null | undefined;
  subtotal: number;
  /** Called when the "keep shopping" link is tapped (drawers close themselves). */
  onNavigate?: () => void;
  className?: string;
  showKeepShopping?: boolean;
}) {
  const { t, lang } = useLanguage();
  const { progress, applies } = useFreeDelivery(shop, subtotal);
  if (!progress) return null;

  const reached = progress.reached;
  const remaining = freeDeliveryAmount(progress.remaining, lang);
  const byLabel = applies
    ? applies.by === "shop"
      ? t("freeDelivery.byShop")
      : t("freeDelivery.byPlatform")
    : null;

  return (
    <div
      data-testid="free-delivery-bar"
      data-reached={reached}
      className={`rounded-xl px-3.5 py-3 ring-1 ${
        reached ? "bg-emerald-50 ring-emerald-200" : "bg-gold-50 ring-gold-200"
      } ${className}`}
    >
      <p className="flex items-start gap-2 text-sm font-semibold text-forest-900">
        <IconTruck className="mt-0.5 h-4 w-4 shrink-0 text-gold-600" aria-hidden="true" />
        <span aria-live="polite">
          {reached ? t("freeDelivery.reached") : t("freeDelivery.addMore").replace("{amount}", remaining)}
          {reached && byLabel ? (
            <span className="ml-1.5 rounded-full bg-paper px-2 py-0.5 text-[0.62rem] font-bold uppercase tracking-wide text-forest-800 ring-1 ring-line">
              {byLabel}
            </span>
          ) : null}
        </span>
      </p>
      <div
        role="progressbar"
        aria-label={t("freeDelivery.progressLabel")}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress.pct}
        className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-paper ring-1 ring-line"
      >
        <div
          className={`h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none ${
            reached ? "bg-emerald-500" : "bg-gold-500"
          }`}
          style={{ width: `${progress.pct}%` }}
        />
      </div>
      <p className="mt-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[11px] text-ink-soft">
        <span>{t("freeDelivery.scope")}</span>
        {!reached && showKeepShopping ? (
          <Link
            href={shop?.slug ? `/shops/${shop.slug}` : "/shop"}
            onClick={onNavigate}
            className="inline-flex min-h-8 items-center font-semibold text-forest-800 underline-offset-2 hover:underline"
          >
            {t("freeDelivery.keepShopping")}
          </Link>
        ) : null}
      </p>
    </div>
  );
}
