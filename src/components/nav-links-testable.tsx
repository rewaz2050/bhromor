"use client";

/**
 * Test harness for NavLinks: the real component, with the item list the
 * header builds (offers-aware). The header itself reads the live catalog;
 * this harness accepts the same list shape so tests can pin the logic
 * without booting a catalog.
 */
import NavLinks, { type NavItem } from "@/components/layout/nav-links";

export default function NavLinksTestable({
  items,
  testItems,
}: {
  items?: NavItem[];
  testItems?: boolean;
}) {
  const NAV: NavItem[] = testItems
    ? [
        { label: "Shop", href: "/shop" },
        { label: "Offers", href: "/shop?filter=sale" },
        { label: "Shops", href: "/shops" },
        { label: "Categories", href: "/#collections" },
        { label: "Track", href: "/track" },
      ]
    : (items ?? []);
  return <NavLinks items={NAV} />;
}
