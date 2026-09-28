"use client";

/**
 * B3 (2026-09-28) — the shop's own promo codes, and what they cost it.
 *
 * The dashboard card does the same work in a smaller space; this page is where
 * a shop sits down to plan a campaign: the caps, the arithmetic on a real
 * order, and every code it has ever made.
 */

import { useVendor } from "@/components/vendor/vendor-shell";
import { useVendorPromos } from "@/lib/use-vendor";
import { PageHeader, Skeleton } from "@/components/vendor/vendor-ui";
import PromoCard from "@/components/vendor/promo-card";

export default function VendorPromoPage() {
  const me = useVendor();
  const authed = me !== null;
  const promos = useVendorPromos(authed);

  return (
    <div>
      <PageHeader
        title="Promo codes"
        sub="Make your own discount code. The discount leaves your share — never the platform's commission — and the maths is on screen before you save."
      />
      {!me || !promos.limits ? (
        <Skeleton lines={3} />
      ) : (
        <PromoCard
          promos={promos.promos}
          limits={promos.limits}
          usedTotal={promos.usedTotal}
          discountBornePaisa={promos.discountBornePaisa}
          commissionPct={Math.round(me.shop.commissionPct ?? 15)}
          loading={promos.loading}
          onCreate={promos.create}
          onToggle={promos.setActive}
        />
      )}
    </div>
  );
}
