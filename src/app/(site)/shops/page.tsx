import type { Metadata } from "next";
import {
  getStorefrontCatalog,
  getStorefrontZones,
} from "@/lib/db/storefront";
import { productShopId } from "@/lib/shop-utils";
import ShopsDirectory from "@/components/shop/shops-directory";

export const metadata: Metadata = {
  title: "Shops",
  description:
    "Independent clothing sellers on PROSANTI — each shop has its own bag and checkout.",
};

export const dynamic = "force-dynamic";

export default async function ShopsPage() {
  const [{ products, shops }, { zones }] = await Promise.all([
    getStorefrontCatalog(),
    getStorefrontZones(),
  ]);
  const fallbackShopId = shops[0]?.id ?? "";
  const productCounts: Record<string, number> = {};
  for (const p of products) {
    const id = productShopId(p, fallbackShopId);
    productCounts[id] = (productCounts[id] ?? 0) + 1;
  }
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
      <ShopsDirectory
        shops={shops}
        zones={zones}
        productCounts={productCounts}
      />
    </div>
  );
}
