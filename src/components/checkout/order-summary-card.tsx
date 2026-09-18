"use client";

/**
 * Order summary card — rendered in the desktop aside AND inside step ③ on
 * phones (UX audit 2026-09-18, P0 #1). Pure presentation: the view owns
 * every number here; the server re-derives them all at placement.
 */

import Image from "next/image";
import Link from "next/link";
import BagShopHeader from "@/components/cart/bag-shop-header";
import BagOffers from "@/components/promo/bag-offers";
import type { useCart } from "@/components/cart/cart-provider";
import { useLanguage } from "@/components/i18n/language-provider";
import { IconBox, IconTruck } from "@/components/ui/icons";
import { coverImage, type DeliveryZone } from "@/lib/catalog";
import { INSTANT_DELIVERY_TITLE, type deliveryBreakdown } from "@/lib/delivery";
import { formatBdt } from "@/lib/format";
import { SUNAMGANJ_HUB } from "@/lib/sunamganj";
import type { BagOffer } from "@/lib/use-bag-offer";

export interface PriceSummary {
  charge: number;
  fullCharge: number;
  freeDelivery: boolean;
  couponFree: boolean;
  plusFree: boolean;
  discount: number;
  promo: number;
  promoKind: BagOffer["kind"] | null;
  giftFee: number;
  referral: number;
  tip: number;
  total: number;
  itemCount: number;
  isOutside: boolean;
  breakdown: ReturnType<typeof deliveryBreakdown> | null;
  distanceKm: number | undefined;
  isNight: boolean;
  isRain: boolean;
}

export type PlusState = "idle" | "checking" | "none" | "pending" | "active" | "expired" | "rejected";

export default function OrderSummaryCard({
  compact,
  detail,
  subtotal,
  summary,
  zone,
  isPickup,
  activeCoupon,
  bagOffer,
  giftWrap,
  plusState,
  bagShopPrep,
  onRemoveCoupon,
}: {
  compact: boolean;
  detail: ReturnType<typeof useCart>["detail"];
  subtotal: number;
  summary: PriceSummary;
  zone: DeliveryZone;
  isPickup: boolean;
  activeCoupon: { code: string } | null;
  bagOffer: BagOffer | null;
  giftWrap: string;
  plusState: PlusState;
  bagShopPrep: number;
  onRemoveCoupon: () => void;
}) {
  const { t } = useLanguage();
  return (
    <div className={`rounded-3xl bg-ivory-50 ring-1 ring-line ${compact ? "p-5" : "bg-paper p-7"}`}>
      <h3 className="font-display text-xl font-medium text-forest-900">
        {t("checkout.yourOrder")}
      </h3>
      <p className="mt-1.5 flex items-center gap-2 text-sm font-semibold text-forest-800">
        <IconTruck className="h-4 w-4 shrink-0 text-gold-600" />
        {isPickup ? `Pickup — ${SUNAMGANJ_HUB}` : `${INSTANT_DELIVERY_TITLE} — ${zone.name}`}
      </p>
      <div className="mt-4">
        <BagShopHeader />
      </div>
      <ul className="mt-5 space-y-4">
        {detail.map((line) => (
          <li
            key={line.product.id + line.variantLabel}
            className="flex gap-4"
          >
            <span className="relative block aspect-[4/5] w-14 shrink-0 overflow-hidden rounded-lg bg-ivory-100 ring-1 ring-line">
              <Image
                src={coverImage(line.product).src}
                alt=""
                fill
                sizes="56px"
                className="object-cover"
              />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-ink">
                {line.product.name}
              </span>
              <span className="mt-0.5 block text-xs text-ink-soft">
                {line.variantLabel} · Qty {line.qty}
              </span>
            </span>
            <span className="text-sm font-semibold text-ink">
              {formatBdt(line.lineTotal)}
            </span>
          </li>
        ))}
      </ul>
      {compact ? (
        <Link href="/cart" className="mt-3 inline-block text-xs font-semibold text-forest-800 underline underline-offset-2">
          ব্যাগ বদলাতে চান? →
        </Link>
      ) : null}
      <div className="mt-4 empty:hidden">
        <BagOffers lines={detail} />
      </div>
      {activeCoupon && (
        <div className="mt-6 flex items-center justify-between rounded-xl bg-forest-50 px-3.5 py-2.5 text-sm ring-1 ring-forest-200">
          <span className="font-mono font-bold text-forest-800">
            {activeCoupon.code}
          </span>
          <button
            type="button"
            onClick={onRemoveCoupon}
            className="text-xs font-semibold text-ink-soft underline underline-offset-2 hover:text-rose-700"
          >
            {t("checkout.remove")}
          </button>
        </div>
      )}

      <dl className="mt-5 space-y-2.5 border-t border-line pt-5 text-sm">
        <div className="flex justify-between">
          <dt className="text-ink-soft">{t("checkout.subtotal")}</dt>
          <dd className="font-medium text-ink">{formatBdt(subtotal)}</dd>
        </div>
        {summary.discount > 0 && activeCoupon && (
          <div className="flex justify-between">
            <dt className="text-ink-soft">{t("checkout.coupon")} · {activeCoupon.code}</dt>
            <dd className="font-medium text-emerald-700">
              −{formatBdt(summary.discount)}
            </dd>
          </div>
        )}
        {summary.promo > 0 && (
          <div className="flex justify-between">
            <dt className="text-ink-soft">
              {summary.promoKind === "bundle"
                ? (bagOffer?.label ?? t("bundle.title"))
                : t("promo.pctOff").replace("{pct}", String(bagOffer?.pct ?? 0))}
            </dt>
            <dd className="font-medium text-emerald-700">
              −{formatBdt(summary.promo)}
            </dd>
          </div>
        )}
        {summary.referral > 0 && (
          <div className="flex justify-between">
            <dt className="text-ink-soft">{t("referral.credit")}</dt>
            <dd className="font-medium text-emerald-700">
              −{formatBdt(summary.referral)}
            </dd>
          </div>
        )}
        {summary.giftFee > 0 && (
          <div className="flex justify-between">
            <dt className="text-ink-soft">
              🎁 {t("gift.wrap")} · {giftWrap}
            </dt>
            <dd className="font-medium text-ink">+{formatBdt(summary.giftFee)}</dd>
          </div>
        )}
        <div className="flex justify-between">
          <dt className="text-ink-soft">
            {t("checkout.delivery")} · {summary.breakdown?.eta ?? zone.etaLabel}
          </dt>
          <dd className="font-medium text-ink">
            {summary.freeDelivery ? (
              <span className="text-forest-700">
                {summary.couponFree
                  ? "FREE 🚚 Coupon"
                  : summary.plusFree
                    ? "FREE 👑 PROSANTI+"
                    : isPickup
                      ? "FREE — Pickup"
                      : "Free"}{" "}
                <span className="text-ink-soft line-through">
                  {formatBdt(summary.fullCharge)}
                </span>
              </span>
            ) : (
              formatBdt(summary.charge)
            )}
          </dd>
        </div>
        {summary.breakdown && summary.breakdown.surcharge.total > 0 && !summary.freeDelivery && (
          <div className="space-y-1 pl-1 text-xs text-ink-soft">
            <div className="flex justify-between"><span>Delivery</span><span>{formatBdt(summary.fullCharge)}</span></div>
            {summary.breakdown.surcharge.night > 0 && <div className="flex justify-between"><span>🌙 Night (9PM-6AM)</span><span>+{formatBdt(summary.breakdown.surcharge.night)}</span></div>}
            {summary.breakdown.surcharge.rain > 0 && <div className="flex justify-between"><span>🌧️ Rain</span><span>+{formatBdt(summary.breakdown.surcharge.rain)}</span></div>}
            {summary.breakdown.surcharge.express > 0 && <div className="flex justify-between"><span>⚡ Express</span><span>+{formatBdt(summary.breakdown.surcharge.express)}</span></div>}
            {summary.breakdown.surcharge.weight > 0 && <div className="flex justify-between"><span>⚖️ Weight</span><span>+{formatBdt(summary.breakdown.surcharge.weight)}</span></div>}
          </div>
        )}
        {summary.couponFree && (
          <p className="rounded-xl bg-forest-50 px-3 py-2 text-xs leading-5 text-forest-900 ring-1 ring-forest-200">
            🚚 Free delivery coupon applied — {activeCoupon?.code}
          </p>
        )}
        {summary.plusFree && !summary.couponFree && (
          <p className="rounded-xl bg-forest-50 px-3 py-2 text-xs leading-5 text-forest-900 ring-1 ring-forest-200">
            👑 PROSANTI+ member — delivery &amp; all surcharges waived on this order.
          </p>
        )}
        {(plusState === "none" || plusState === "expired" || plusState === "rejected") &&
          !summary.couponFree &&
          !isPickup && (
            <p className="text-xs leading-5 text-ink-soft">
              👑 {plusState === "none" ? "Not a member yet" : "Membership ended"} — PROSANTI+ (৳99/মাস)
              gets free delivery on every order.{" "}
              <Link href="/account" className="font-semibold text-forest-800 underline underline-offset-2">
                Join from your account
              </Link>
            </p>
          )}
        {plusState === "pending" && (
          <p className="text-xs text-ink-soft">🕓 Your PROSANTI+ application is with the shop — it activates after the wallet check.</p>
        )}
        {summary.tip > 0 && (
          <div className="flex justify-between">
            <dt className="text-ink-soft">💝 Tip for Rider</dt>
            <dd className="font-medium text-forest-700">+{formatBdt(summary.tip)}</dd>
          </div>
        )}
        {isPickup && (
          <p className="rounded-xl bg-sky-50 px-3 py-2 text-xs text-sky-900 ring-1 ring-sky-200">🏪 Pickup at {SUNAMGANJ_HUB} — no delivery, ready in {bagShopPrep} min</p>
        )}
        <div className="flex justify-between pt-2 text-base">
          <dt className="font-semibold text-ink">
            {t("checkout.totalCod")}{isPickup ? " (Pickup)" : ""}
          </dt>
          <dd className="font-bold text-ink" data-testid={compact ? "summary-total-mobile" : "summary-total"}>
            {formatBdt(summary.total)}
          </dd>
        </div>
      </dl>
      {!compact ? (
        <p className="mt-5 flex items-start gap-2 rounded-xl bg-ivory-100 px-3.5 py-3 text-xs leading-5 text-ink-soft">
          <IconBox className="mt-0.5 h-4 w-4 shrink-0 text-forest-700" />
          {t("checkout.followOrderHint")}
        </p>
      ) : null}
    </div>
  );
}
