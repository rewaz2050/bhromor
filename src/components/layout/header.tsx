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
  { label: "New Arrivals", href: "/shop?filter=new" },
  { label: "Track Order", href: "/track" },
  { label: "About", href: "/about" },
];

export default function Header() {
  return (
    <header className="sticky top-0 z-40">
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
          <NavLinks items={NAV} />

          <div className="ml-auto flex shrink-0 items-center sm:gap-1.5">
            <ProductSearch />
            <WishlistButton />
            <CartButton />
          </div>
        </div>
      </div>
    </header>
  );
}
