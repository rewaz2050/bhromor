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
  { label: "Men", href: "/shop?category=men" },
  { label: "Women", href: "/shop?category=women" },
  { label: "Traditional", href: "/shop?category=traditional" },
  { label: "New Arrivals", href: "/shop?filter=new" },
];

export default function Header() {
  return (
    <header className="storefront-header sticky top-0 z-40">
      {/* Announcement bar — CMS-editable (§31) */}
      <AnnouncementBar />

      <div className="border-b border-line bg-ivory-50/90 backdrop-blur supports-[backdrop-filter]:bg-ivory-50/75">
        <div className="mx-auto flex h-18 max-w-7xl lg:h-24 items-center gap-1 px-3 sm:gap-4 sm:px-6 lg:px-8">
          <MobileNav />

          {/* Brand lockup */}
          <Link
            href="/"
            className="group flex min-w-0 items-center gap-2 sm:gap-3"
            aria-label="PROSANTI home"
          >
            <LogoMark className="hidden h-10 w-auto shrink-0 transition-transform sm:block duration-300 group-hover:scale-105" />
            <span className="flex flex-col leading-none">
              <span className="font-display text-base font-semibold tracking-[0.1em] sm:text-xl sm:tracking-[0.2em] lg:text-2xl text-forest-900">
                PROSANTI
              </span>
              <span className="font-bengali mt-1.5 text-[0.6rem] tracking-wide text-ink-soft">
                প্রশান্তি
              </span>
            </span>
          </Link>

          {/* Desktop nav */}
          <Suspense>
            <NavLinks items={NAV} />
          </Suspense>

          <div className="ml-auto flex shrink-0 items-center sm:gap-1.5">
            <ProductSearch />
            <Link
              href="/account"
              aria-label="Your account"
              className="hidden h-11 w-11 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-forest-100 hover:text-forest-900 sm:flex"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                className="h-5 w-5"
              >
                <circle cx="12" cy="8" r="3.5" />
                <path d="M5 21v-2a7 7 0 0 1 14 0v2" />
              </svg>
            </Link>
            <WishlistButton />
            <CartButton />
          </div>
        </div>
      </div>
    </header>
  );
}
