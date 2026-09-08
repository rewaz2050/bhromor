"use client";

import { Suspense, useEffect, useState } from "react";
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

/**
 * Sticky header that condenses as soon as the page moves: the announcement
 * bar folds away and the bar gets shorter, so long catalogue pages keep
 * their breathing room without losing the navigation.
 */
export default function Header() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 12);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  return (
    <header className="storefront-header sticky top-0 z-40" data-scrolled={scrolled}>
      {/* Announcement bar — CMS-editable (§31), folds away on scroll */}
      <div className="announcement-shell">
        <div>
          <AnnouncementBar />
        </div>
      </div>

      <div
        className={`header-bar border-b border-line ${
          scrolled
            ? "bg-ivory-50/95 supports-[backdrop-filter]:bg-ivory-50/85"
            : "bg-ivory-50/90 supports-[backdrop-filter]:bg-ivory-50/75"
        } backdrop-blur`}
      >
        <div
          className={`mx-auto flex max-w-7xl items-center gap-1 px-3 sm:gap-4 sm:px-6 lg:px-8 ${
            scrolled ? "h-14 sm:h-16" : "h-16 sm:h-18 lg:h-20"
          }`}
        >
          <MobileNav />

          {/* Brand lockup */}
          <Link
            href="/"
            className="brand-lockup group flex min-w-0 items-center gap-2 sm:gap-3"
            aria-label="PROSANTI home"
          >
            <LogoMark
              className={`w-auto shrink-0 transition-transform duration-300 group-hover:scale-105 ${
                scrolled ? "h-7 sm:h-8" : "h-8 sm:h-9"
              }`}
            />
            <span className="flex flex-col leading-none">
              <span
                className={`font-display font-semibold tracking-[0.12em] text-forest-900 sm:tracking-[0.18em] ${
                  scrolled ? "text-[0.95rem] sm:text-lg" : "text-base sm:text-xl"
                }`}
              >
                PROSANTI
              </span>
              <span
                lang="bn"
                className="font-bengali mt-1 hidden text-[0.58rem] font-medium text-ink-soft sm:block"
              >
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
