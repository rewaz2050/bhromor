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
            ? "border-line/60 bg-ivory-50/92 supports-[backdrop-filter]:bg-ivory-50/82"
            : "border-line/35 bg-ivory-50/75 supports-[backdrop-filter]:bg-ivory-50/65"
        } backdrop-blur-xl supports-[backdrop-filter]:backdrop-saturate-150`}
      >
        <div
          className={`mx-auto flex max-w-7xl items-center gap-2 px-3 transition-[height] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] sm:gap-3 sm:px-6 lg:gap-6 lg:px-8 ${
            scrolled ? "h-[3.65rem] sm:h-[4rem] lg:h-[4.25rem]" : "h-[4.2rem] sm:h-[4.85rem] lg:h-[5.1rem]"
          }`}
        >
          {/* Left: mobile menu trigger — hidden on desktop where nav takes over */}
          <div className="flex shrink-0 items-center lg:hidden">
            <MobileNav />
          </div>

          {/* Brand — centered on phones (absolute), left on desktop */}
          <Link
            href="/"
            className="brand-lockup group absolute left-1/2 flex min-w-0 -translate-x-1/2 items-center gap-2.5 sm:gap-3 lg:static lg:translate-x-0"
            aria-label="PROSANTI home"
          >
            <span className="relative flex shrink-0 items-center justify-center">
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 -z-10 rounded-full bg-forest-50 opacity-0 blur-xl transition-opacity duration-500 group-hover:opacity-60"
              />
              <LogoMark
                className={`w-auto shrink-0 transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform group-hover:scale-[1.02] ${
                  scrolled ? "h-[1.9rem] sm:h-[2.05rem]" : "h-[2.05rem] sm:h-[2.4rem]"
                }`}
              />
            </span>
            <span className="hidden flex-col leading-none sm:flex">
              <span
                className={`font-display font-semibold tracking-[0.14em] text-forest-900 transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] sm:tracking-[0.18em] ${
                  scrolled ? "text-[0.95rem] sm:text-[1.05rem]" : "text-[1.02rem] sm:text-[1.28rem]"
                }`}
              >
                PROSANTI
              </span>
              <span
                lang="bn"
                className={`font-bengali hidden font-medium tracking-wide text-ink-soft transition-all duration-500 sm:block ${
                  scrolled ? "text-[0.52rem] opacity-75" : "text-[0.58rem]"
                }`}
              >
                প্রশান্তি
              </span>
            </span>
            {/* Phones — wordmark only, keep it compact */}
            <span
              className={`font-display font-semibold tracking-[0.14em] text-forest-900 sm:hidden ${
                scrolled ? "text-[1rem]" : "text-[1.08rem]"
              }`}
            >
              PROSANTI
            </span>
          </Link>

          {/* Desktop nav — centered, breathable pills */}
          <div className="hidden flex-1 justify-center lg:flex">
            <Suspense>
              <NavLinks items={NAV} />
            </Suspense>
          </div>

          {/* Actions — always on the right, consistent 44px targets */}
          <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-1.5 lg:gap-2">
            {/* Desktop divider + language — easy to find, never competes with cart */}
            <span className="hidden h-6 w-px bg-line/60 lg:block" aria-hidden="true" />
            <div className="hidden lg:flex">
              <LanguageSwitcher variant="header" />
            </div>
            {/* Phone language is a single 44px tap — one letter shows the *other* language */}
            <div className="flex lg:hidden">
              <LanguageSwitcher variant="toggle" />
            </div>
            <ProductSearch />
            <div className="hidden sm:flex">
              <WishlistButton />
            </div>
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

        {/* Scroll progress — thin gold line, only when scrolling */}
        <div
          className="header-progress"
          aria-hidden="true"
          style={{ transform: `scaleX(${progress})` }}
        />
      </div>
    </header>
  );
}
