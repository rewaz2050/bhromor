"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import LogoMark from "@/components/logo-mark";
import CartButton from "./cart-button";
import MobileNav from "./mobile-nav";
import NavLinks, { type NavItem } from "./nav-links";
import WishlistButton from "./wishlist-button";
import AnnouncementBar from "./announcement-bar";
import ProductSearch from "./product-search";
import LanguageSwitcher from "./language-switcher";
import ZonePill from "./zone-pill";
import { useLanguage } from "@/components/i18n/language-provider";
import { useLiveCatalog } from "@/lib/use-live-catalog";
import { offerProducts } from "@/lib/home-shelves";
import { IconUser } from "@/components/ui/icons";

/**
 * Sticky storefront header (menubar redesign, 2026-09-26).
 *
 * Three balanced zones on desktop — brand | primary nav | actions — with
 * the nav as a wayfinding strip (hairline under the current section, a
 * category drop-down) and the actions in the order people expect on a
 * shop: language, search, wishlist, account, bag. A thin gold line shows
 * reading progress.
 *
 * Scroll audit 2026-09-27 — the header must never make scrolling itself
 * jerky, so it is now paint-only while the page moves:
 *  - the announcement bar is normal flow ABOVE the sticky bar and scrolls
 *    away with the page (the old grid-rows fold + bar-height animation ran
 *    a layout on every frame around the 10 px threshold and shifted the
 *    whole page under the thumb);
 *  - the bar keeps ONE height per breakpoint (the shop filter bar sticks
 *    under it at the same offset), no logo/wordmark size transitions;
 *  - scroll progress is written to the gold line's transform from a
 *    requestAnimationFrame via a ref — no React state, so nothing in the
 *    header re-renders per frame; `scrolled` flips once and only toggles a
 *    shadow/border;
 *  - the frosted blur is desktop-only (`pointer-fine:`); on phones a
 *    near-opaque bar costs nothing per frame.
 */
export default function Header() {
  const { t } = useLanguage();
  // Offers appears only while something is genuinely on offer (admin sets
  // compare-at prices / flash windows) — the menu never advertises an empty
  // sale. Categories is a drop-down once the live catalog answers and the
  // home-shelf jump before that.
  const { products } = useLiveCatalog();
  const hasOffers = offerProducts(products).length > 0;
  const NAV: NavItem[] = [
    { label: t("nav.shop"), href: "/shop" },
    { label: t("nav.categories"), href: "/#collections", menu: "categories" },
    ...(hasOffers ? [{ label: t("nav.offers"), href: "/offers" }] : []),
    { label: t("nav.shops"), href: "/shops" },
    { label: t("nav.track"), href: "/track" },
  ];
  const [scrolled, setScrolled] = useState(false);
  const scrolledRef = useRef(false);
  const progressRef = useRef<HTMLDivElement>(null);
  const lastProgress = useRef(-1);
  const ticking = useRef(false);

  useEffect(() => {
    // Scrollable distance, measured when the page changes size (not per
    // frame — reading scrollHeight in a scroll handler can force a layout).
    let docH = 0;
    const measure = () => {
      docH = document.documentElement.scrollHeight - window.innerHeight;
    };

    const update = () => {
      ticking.current = false;
      const y = window.scrollY;
      const next = y > 10;
      if (next !== scrolledRef.current) {
        scrolledRef.current = next;
        setScrolled(next);
      }
      const p = docH > 0 ? Math.min(1, Math.max(0, y / docH)) : 0;
      // Compositor-only: the line is a transform, written straight to the
      // element. Skip sub-pixel changes so a still page costs nothing.
      if (Math.abs(p - lastProgress.current) > 0.002 || p === 0 || p === 1) {
        lastProgress.current = p;
        if (progressRef.current) progressRef.current.style.transform = `scaleX(${p.toFixed(4)})`;
      }
    };

    const onScroll = () => {
      if (!ticking.current) {
        ticking.current = true;
        requestAnimationFrame(update);
      }
    };
    const onResize = () => {
      measure();
      onScroll();
    };

    measure();
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    // Content grows after paint (live catalog, "show more", drawers) — keep
    // the denominator honest without touching layout on scroll.
    const grow =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(onResize) : null;
    grow?.observe(document.body);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      grow?.disconnect();
    };
  }, []);

  return (
    <>
      {/* Announcement bar — CMS-editable (§31). Normal flow: scrolls away
          with the page instead of animating the sticky bar's height. */}
      <AnnouncementBar />

      <header className="storefront-header sticky top-0 z-40" data-scrolled={scrolled}>
        <div className="header-bar relative border-b border-line/50 bg-ivory-50/96 pointer-fine:bg-ivory-50/85 pointer-fine:backdrop-blur-xl pointer-fine:backdrop-saturate-150">
          <div className="mx-auto flex h-14 max-w-7xl items-center gap-2 px-3 sm:h-[4.1rem] sm:gap-4 sm:px-6 lg:px-8">
            <MobileNav />

            {/* Brand lockup — the Latin wordmark keeps its tracking in every
                language (lang="en"); the text column steps aside on the
                narrowest phones instead of colliding with the actions. */}
            <Link
              href="/"
              className="brand-lockup group flex min-w-0 shrink items-center gap-2.5 sm:gap-3.5"
              aria-label="PROSANTI home"
            >
              <span className="relative flex shrink-0 items-center justify-center">
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 -z-10 rounded-full bg-forest-50 opacity-0 blur-xl transition-opacity duration-500 group-hover:opacity-70"
                />
                <LogoMark className="h-8 w-auto shrink-0 sm:h-[2.1rem]" />
              </span>
              <span className="hidden min-w-0 flex-col leading-none min-[360px]:flex">
                <span
                  lang="en"
                  className="truncate font-display text-[1.02rem] font-semibold tracking-[0.12em] text-forest-900 sm:text-[1.16rem] sm:tracking-[0.18em]"
                >
                  PROSANTI
                </span>
                <span lang="bn" className="font-bengali hidden text-[0.62rem] font-medium text-ink-soft sm:block">
                  প্রশান্তি
                </span>
              </span>
            </Link>

            {/* Desktop nav — centered between brand and actions. */}
            <div className="hidden min-w-0 flex-1 justify-center lg:flex">
              <Suspense>
                <NavLinks items={NAV} />
              </Suspense>
            </div>

            <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-1.5">
              {/* UX plan §1.2 (R3) — remembered delivery area, one tap to change. */}
              <div className="hidden sm:flex">
                <ZonePill />
              </div>
              <div className="hidden sm:flex">
                <LanguageSwitcher variant="header" />
              </div>
              {/* Phones: one-tap language toggle — the bottom bar already
                  carries the wishlist (P1 #8). */}
              <div className="flex sm:hidden">
                <LanguageSwitcher variant="toggle" />
              </div>
              <span className="mx-1 hidden h-6 w-px bg-line/80 sm:block" aria-hidden="true" />
              <ProductSearch />
              <div className="hidden sm:flex">
                <WishlistButton />
              </div>
              {/* Account is one tap from every desktop page (audit L7). Hidden
                  on phones — the drawer's quick actions carry it. */}
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

          {/* Scroll progress — thin gold line, driven by ref (see effect). */}
          <div ref={progressRef} className="header-progress" aria-hidden="true" />
        </div>
      </header>
    </>
  );
}
