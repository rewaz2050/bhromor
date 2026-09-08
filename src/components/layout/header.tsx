import { Suspense } from "react";
import Link from "next/link";
import LogoMark from "@/components/logo-mark";
import CartButton from "./cart-button";
import MobileNav from "./mobile-nav";
import NavLinks from "./nav-links";
import WishlistButton from "./wishlist-button";
import AnnouncementBar from "./announcement-bar";
import ProductSearch from "./product-search";

const NAV = [
  { label: "Shop", href: "/shop" },
  { label: "Collections", href: "/#collections" },
  { label: "Our Story", href: "/#story" },
  { label: "Journal", href: "/#journal" },
];

export default function Header() {
  return (
    <header className="storefront-header sticky top-0 z-40">
      {/* Announcement bar — CMS-editable (§31) */}
      <AnnouncementBar />

      <div className="border-b border-line bg-ivory-50/90 backdrop-blur supports-[backdrop-filter]:bg-ivory-50/75">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-1 px-3 sm:h-18 sm:gap-4 sm:px-6 lg:h-20 lg:px-8">
          <MobileNav />

          {/* Brand lockup */}
          <Link
            href="/"
            className="group flex min-w-0 items-center gap-2 sm:gap-3"
            aria-label="PROSANTI home"
          >
            <LogoMark className="h-8 w-auto shrink-0 transition-transform duration-300 group-hover:scale-105 sm:h-9" />
            <span className="flex flex-col leading-none">
              <span className="font-display text-base font-semibold tracking-[0.12em] text-forest-900 sm:text-xl sm:tracking-[0.18em]">
                PROSANTI
              </span>
              <span lang="bn" className="font-bengali mt-1 hidden text-[0.58rem] font-medium text-ink-soft sm:block">
                প্রশান্তি
              </span>
            </span>
          </Link>

          {/* Desktop nav */}
          <Suspense>
            <NavLinks items={NAV} />
          </Suspense>

          <div className="ml-auto flex shrink-0 items-center gap-0.5 sm:gap-1">
            <ProductSearch />
            <WishlistButton />
            <CartButton />
          </div>
        </div>
      </div>
    </header>
  );
}
