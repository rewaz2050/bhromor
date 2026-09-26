"use client";

import type { Shop } from "@/lib/catalog";
import { isShopOrderable } from "@/lib/shop-utils";
import { shopChatMessage, waLink } from "@/lib/whatsapp-order";
import { useLanguage } from "@/components/i18n/language-provider";
import { IconSend } from "@/components/ui/icons";
import FreeDeliveryPill from "./free-delivery-pill";

/**
 * Shop storefront header (marketplace slice 4): open state, prep time,
 * rating, served zones and contact — plus an honest closed notice.
 * "Chat on WhatsApp" (P1 #15) appears only when the shop has a real BD mobile.
 */
export default function ShopHero({
  shop,
  zoneNames,
}: {
  shop: Shop;
  zoneNames: string[];
}) {
  const { t, lang } = useLanguage();
  const open = isShopOrderable(shop);
  const waChatHref = waLink(shop.phone, shopChatMessage(shop, lang));
  return (
    <header className="mt-8 rounded-3xl bg-forest-900 p-8 text-ivory-100 sm:p-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-display text-3xl font-medium tracking-tight sm:text-4xl">
            {shop.name}
          </h1>
          {shop.tagline && (
            <p className="mt-2 max-w-xl text-ivory-100/75">{shop.tagline}</p>
          )}
          {/* Free-delivery threshold (2026-09-26) — only when a rule is armed. */}
          <FreeDeliveryPill shop={shop} tone="dark" className="mt-3" />
        </div>
        <span
          className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${
            open
              ? "bg-forest-100 text-forest-900"
              : "bg-ivory-100/15 text-ivory-100"
          }`}
        >
          {open ? t("shops.openNow") : t("shops.closed")}
        </span>
      </div>
      <dl className="mt-6 flex flex-wrap gap-x-8 gap-y-3 text-sm">
        <div>
          <dt className="text-xs uppercase tracking-widest text-ivory-100/60">
            {t("shops.preparesIn")}
          </dt>
          <dd className="mt-0.5 font-semibold">~{shop.prepMinutes} min</dd>
        </div>
        {shop.ratingCount > 0 && (
          <div>
            <dt className="text-xs uppercase tracking-widest text-ivory-100/60">
              {t("shops.rating")}
            </dt>
            <dd className="mt-0.5 font-semibold">
              ★ {shop.ratingAvg.toFixed(1)} ({shop.ratingCount})
            </dd>
          </div>
        )}
        <div>
          <dt className="text-xs uppercase tracking-widest text-ivory-100/60">
            {t("shops.deliversTo")}
          </dt>
          <dd className="mt-0.5 font-semibold">
            {zoneNames.length > 0 ? zoneNames.join(" · ") : "—"}
          </dd>
        </div>
        {shop.phone && (
          <div>
            <dt className="text-xs uppercase tracking-widest text-ivory-100/60">
              {t("shops.contact")}
            </dt>
            <dd className="mt-0.5 font-semibold">{shop.phone}</dd>
          </div>
        )}
      </dl>
      {waChatHref ? (
        <a
          href={waChatHref}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="whatsapp-shop-chat"
          className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-sm bg-ivory-50 px-5 text-sm font-semibold text-forest-900 transition-colors hover:bg-white"
        >
          <IconSend className="h-4 w-4" /> {t("shops.chatWhatsApp")}
        </a>
      ) : null}
      {!open && (
        <p className="mt-6 rounded-2xl bg-ivory-100/10 px-4 py-3 text-sm text-ivory-100/85 ring-1 ring-ivory-100/20">
          <span className="font-semibold">{t("shops.shopClosed")}</span> —{" "}
          {t("shops.shopClosedHint")}
        </p>
      )}
    </header>
  );
}
