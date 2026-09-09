import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getStorefrontCatalog,
  getStorefrontZones,
} from "@/lib/db/storefront";
import { productShopId } from "@/lib/shop-utils";
import { IconChevron } from "@/components/ui/icons";
import ShopHero from "@/components/shop/shop-hero";
import ShopProducts from "@/components/shop/shop-products";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const { shops } = await getStorefrontCatalog();
  const shop = shops.find((s) => s.slug === slug);
  if (!shop) return {};
  return {
    title: `${shop.name} — PROSANTI`,
    description: shop.tagline ?? `Shop ${shop.name} on PROSANTI.`,
  };
}

export default async function ShopPage({ params }: PageProps) {
  const { slug } = await params;
  const [{ products, shops }, { zones }] = await Promise.all([
    getStorefrontCatalog(),
    getStorefrontZones(),
  ]);
  const shop = shops.find((s) => s.slug === slug);
  if (!shop) notFound();

  const fallbackShopId = shops[0]?.id ?? "";
  const shelf = products.filter(
    (p) => productShopId(p, fallbackShopId) === shop.id,
  );
  const zoneNames = shop.zoneIds
    .map((id) => zones.find((z) => z.id === id)?.name)
    .filter((n): n is string => !!n);

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
      <nav
        aria-label="Breadcrumb"
        className="flex items-center gap-1.5 text-sm text-ink-soft"
      >
        <Link href="/" className="transition-colors hover:text-forest-700">
          Home
        </Link>
        <IconChevron className="h-3.5 w-3.5 -rotate-90 text-ink-soft/60" />
        <Link href="/shops" className="transition-colors hover:text-forest-700">
          Shops
        </Link>
        <IconChevron className="h-3.5 w-3.5 -rotate-90 text-ink-soft/60" />
        <span aria-current="page" className="truncate text-ink">
          {shop.name}
        </span>
      </nav>

      <ShopHero shop={shop} zoneNames={zoneNames} />

      <div className="mt-10">
        <ShopProducts products={shelf} shop={shop} zones={zones} />
      </div>
    </div>
  );
}
