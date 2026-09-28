"use client";

import Link from "next/link";
import { useCart } from "./cart-provider";
import { useLiveCatalog } from "@/lib/use-live-catalog";
import {
  isShopOrderable,
  lineShopIds,
  shopById,
  shopClosedCopy,
} from "@/lib/shop-utils";
import { useLanguage } from "@/components/i18n/language-provider";

/**
 * Which shop the bag belongs to (marketplace slice 4, D1). One order =
 * one shop, so the header names the kitchen + prep time; a closed shop
 * (or a legacy mixed bag) gets an honest warning before checkout.
 */
export default function BagShopHeader() {
  const { t } = useLanguage();
  const { detail } = useCart();
  const { shops } = useLiveCatalog();
  if (detail.length === 0) return null;

  const ids = lineShopIds(detail, shops[0]?.id ?? "");
  if (ids.length > 1) {
    return (
      <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900 ring-1 ring-amber-200">
        {t("shops.mixedBag").replace("{n}", String(ids.length))}
      </p>
    );
  }
  const shop = shopById(shops, ids[0]);
  if (!shop) return null;
  const open = isShopOrderable(shop);
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl bg-ivory-100 px-4 py-3 text-sm ring-1 ring-line">
      <span className="text-ink-soft">{t("shops.bagFrom")}</span>
      <Link
        href={`/shops/${shop.slug}`}
        className="font-semibold text-forest-800 underline-offset-2 hover:underline"
      >
        {shop.name}
      </Link>
      <span className="text-ink-soft">
        · {t("shops.prepIn").replace("{min}", String(shop.prepMinutes))}
      </span>
      {!open && (
        <span
          data-testid="bag-shop-closed"
          className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-900"
        >
          {/* B6 — "closed" and "on holiday until the 13th" are different news. */}
          {shopClosedCopy(shop, t).text} — {t("shops.shopClosedHint")}
        </span>
      )}
    </div>
  );
}
