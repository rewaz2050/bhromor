"use client";

/**
 * B4 (2026-09-28) — the shop's own funnel, full page.
 *
 * The dashboard card is the same report in a smaller space; here the shop can
 * switch the window (7 / 28 days) and open the per-product table: seen →
 * added → actually ordered.
 */

import { useState } from "react";
import { useVendor } from "@/components/vendor/vendor-shell";
import { useVendorFunnel } from "@/lib/use-vendor";
import { PageHeader } from "@/components/vendor/vendor-ui";
import FunnelCard from "@/components/vendor/funnel-card";
import type { ShopFunnel } from "@/lib/shop-funnel";

type Days = 7 | 28;

export default function VendorFunnelPage() {
  const me = useVendor();
  const [days, setDays] = useState<Days>(7);
  const funnel = useVendorFunnel(me !== null, days);

  return (
    <div>
      <PageHeader
        title="Your funnel"
        sub="How people move through your shop: visits → product → bag → checkout → order. Orders are counted from real orders — cancelled and returned ones are left out."
      />
      <FunnelCard
        funnel={funnel.funnel as ShopFunnel | null}
        days={days}
        loading={funnel.loading}
        missing={funnel.missing}
        error={funnel.error}
        onDays={setDays}
        onRetry={funnel.refresh}
      />
    </div>
  );
}
