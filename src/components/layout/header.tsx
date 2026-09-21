"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import LogoMark from "@/components/logo-mark";
import CartButton from "./cart-button";
import MobileNav from "./mobile-nav";
import NavLinks from "./nav-links";
import WishlistButton from "./wishlist-button";
import AnnouncementBar from "./announcement-bar";
import ProductSearch from "./product-search";
import LanguageSwitcher from "./language-switcher";
import { useLanguage } from "@/components/i18n/language-provider";
import { useLiveCatalog } from "@/lib/use-live-catalog";
import { offerProducts } from "@/lib/home-shelves";
import { IconUser } from "@/components/ui/icons";

/**
 * Premium sticky header — glass morphism, condensed on scroll,
 * scroll progress indicator, and buttery rAF-throttled updates.
 */
export default function Header() {
  const { t } = useLanguage();
  // Offers appears only while something is genuinely on offer (admin sets
  // compare-at prices / flash windows) — the menu never advertises an empty
  // sale. Categories jumps to the home shelf, as before.
  const { products } = useLiveCatalog();
  const hasOffers = offerProducts(products).length > 0;
  const NAV = [
    { label: t("nav.shop"), href: "/shop" },
    ...(hasOffers ? [{ label: t("nav.offers"), href: "/shop?filter=sale" }] : []),
    { label: t("nav.shops"), href: "/shops" },
    { label: t("nav.categories"), href: "/#collections" },
    { label: t("nav.track"), href: "/track" },
  ];
  const [scrolled, setScrolled] = useState(false);
  const [progress, setProgress] = useState(0);
  const ticking = useRef(false);

  useEffect(() => {
    const update = () => {
      const y = window.scrollY;
      setScrolled(y > 10);

      const docH = document.documentElement.scrollHeight - window.innerHeight;
      const p = docH > 0 ? Math.min(1, Math.max(0, y / docH)) : 0;
      setProgress(p);
      ticking.current = false;
    };

    const onScroll = () => {
      if (!ticking.current) {
        ticking.current = true;
        requestAnimationFrame(update);
      }
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return (
    <header
      className="storefront-header sticky top-0 z-40"
      data-scrolled={scrolled}
      style={{ ["--scroll-progress" as string]: String(progress) } as React.CSSProperties}
    >
      {/* Announcement bar — CMS-editable (§31), folds away on scroll with grid animation */}
      <div className="announcement-shell">
        <div>
          <AnnouncementBar />
        </div>
      </div>

      <div
        className={`header-bar relative border-b ${
          scrolled
            ? "border-line/70 bg-ivory-50/88 supports-[backdrop-filter]:bg-ivory-50/78"
            : "border-line/40 bg-ivory-50/72 supports-[backdrop-filter]:bg-ivory-50/60"
        } backdrop-blur-xl supports-[backdrop-filter]:backdrop-saturate-150`}
      >
        <div
          className={`mx-auto flex max-w-7xl items-center gap-2 px-3 transition-[height] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] sm:gap-4 sm:px-6 lg:px-8 ${
            scrolled ? "h-14 sm:h-[4.1rem]" : "h-[4.6rem] sm:h-[5.1rem] lg:h-[5.4rem]"
          }`}
        >
          <MobileNav />

          {/* Brand lockup — premium hover lift */}
          <Link
            href="/"
            className="brand-lockup group flex min-w-0 items-center gap-2.5 sm:gap-3.5"
            aria-label="PROSANTI home"
          >
            <span className="relative flex shrink-0 items-center justify-center">
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 -z-10 rounded-full bg-forest-50 opacity-0 blur-xl transition-opacity duration-500 group-hover:opacity-70"
              />
              <LogoMark
                className={`w-auto shrink-0 transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform group-hover:scale-[1.03] group-hover:-rotate-1 ${
                  scrolled ? "h-[1.85rem] sm:h-8" : "h-8 sm:h-[2.35rem]"
                }`}
              />
            </span>
            <span className="flex flex-col leading-none">
              <span
                className={`font-display font-semibold tracking-[0.12em] text-forest-900 transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] sm:tracking-[0.18em] ${
                  scrolled ? "text-[0.98rem] sm:text-[1.08rem]" : "text-[1.05rem] sm:text-[1.32rem]"
                }`}
              >
                PROSANTI
              </span>
              <span
                lang="bn"
                className={`font-bengali hidden font-medium text-ink-soft transition-all duration-500 sm:block ${
                  scrolled ? "text-[0.52rem] opacity-80" : "text-[0.58rem]"
                }`}
              >
                প্রশান্তি
              </span>
            </span>
          </Link>

          {/* Desktop nav — centered editorial pills */}
          <Suspense>
            <NavLinks items={NAV} />
          </Suspense>

          <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-1.5">
            <span className="hidden h-6 w-px bg-line/70 sm:block" aria-hidden="true" />
            <div className="hidden sm:flex">
              <LanguageSwitcher variant="header" />
            </div>
            {/* Phones: one-tap language toggle where the wishlist icon was —
                the bottom bar already carries the wishlist (P1 #8). */}
            <div className="flex sm:hidden">
              <LanguageSwitcher variant="toggle" />
            </div>
            <ProductSearch />
            <div className="hidden sm:flex">
              <WishlistButton />
            </div>
            {/* Account was reachable only from the burger menu / footer on
                desktop (audit L7). Hidden on phones — the bottom bar's Menu
                already lists it. */}
            <Link
              href="/account"
              aria-label={t("header.account")}
              title={t("header.account")}
              className="header-icon-btn relative hidden h-11 w-11 items-center justify-center rounded-full text-ink-soft hover:text-forest-900 sm:flex"
            >
              <IconUser className="h-[1.18rem] w-[1.18rem]" />
            </Link>
            <CartButton />
          </div>
        </div>

        {/* Scroll progress — thin gold line */}
        <div
          className="header-progress"
          aria-hidden="true"
          style={{ transform: `scaleX(${progress})` }}
        />
      </div>
    </header>
  );
}
