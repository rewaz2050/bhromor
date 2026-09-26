"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import LogoMark from "@/components/logo-mark";
import Drawer from "@/components/ui/drawer";
import {
  IconArrowRight,
  IconBox,
  IconChevron,
  IconClock,
  IconClose,
  IconHeart,
  IconMenu,
  IconStore,
  IconTag,
  IconUser,
} from "@/components/ui/icons";
import LanguageSwitcher from "./language-switcher";
import { useLanguage } from "@/components/i18n/language-provider";
import { useLiveCatalog } from "@/lib/use-live-catalog";
import { useWishlist } from "@/lib/use-wishlist";
import { categoryLabel, offerProducts } from "@/lib/home-shelves";
import { categoryMenuEntries } from "@/lib/category-menu";

const fmt = (tpl: string, vars: Record<string, string | number>) =>
  Object.entries(vars).reduce(
    (s, [k, v]) => s.replaceAll(`{${k}}`, String(v)),
    tpl,
  );

/**
 * Phone / tablet menu (menubar redesign, 2026-09-26).
 *
 * Laid out the way a shopper thinks, top to bottom: language first (so
 * someone who cannot read the current one can switch before anything else),
 * three quick actions (account · wishlist · track order), the shop entries, every
 * category that has pieces — photo, name, count — straight into the filtered
 * shop, then help pages, then customer care. One quiet list with 48px rows
 * instead of a stack of black blocks that hid everything below the fold.
 */
export default function MobileNav({ bottom = false }: { bottom?: boolean }) {
  const { t, lang } = useLanguage();
  const { products, categories } = useLiveCatalog();
  const { count: wishlistCount } = useWishlist();
  const hasOffers = offerProducts(products).length > 0;
  const categoryEntries = useMemo(
    () => categoryMenuEntries(products, categories, 0),
    [products, categories],
  );

  const PRIMARY = [
    { label: t("nav.shop"), href: "/shop", icon: <IconBox className="h-[1.1rem] w-[1.1rem]" /> },
    ...(hasOffers
      ? [{ label: t("nav.offers"), href: "/shop?filter=sale", icon: <IconTag className="h-[1.1rem] w-[1.1rem]" />, offer: true }]
      : []),
    { label: t("nav.shops"), href: "/shops", icon: <IconStore className="h-[1.1rem] w-[1.1rem]" /> },
  ];
  const HELP = [
    { label: t("footer.deliveryInfo"), href: "/delivery" },
    { label: t("footer.returns"), href: "/returns" },
    { label: t("footer.faq"), href: "/faq" },
    { label: t("footer.contact"), href: "/contact" },
    { label: t("footer.ourStory"), href: "/about" },
  ];
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const lastPath = useRef(pathname);

  // Close on navigation — otherwise the panel stayed open over the new page.
  useEffect(() => {
    if (lastPath.current !== pathname) {
      lastPath.current = pathname;
      setOpen(false);
    }
  }, [pathname]);

  const isCurrent = (href: string) => {
    const [path] = href.split(/[?#]/);
    if (!path || path === "/") return pathname === "/";
    if (href.includes("?")) return false;
    return pathname === path || pathname.startsWith(`${path}/`);
  };
  const closeMenu = () => setOpen(false);
  const reveal = (i: number) =>
    ({
      animation: open ? `storefront-reveal 420ms cubic-bezier(0.22,1,0.36,1) both` : undefined,
      animationDelay: open ? `${60 + i * 30}ms` : undefined,
    }) as React.CSSProperties;

  const sectionTitle =
    "px-3 pb-2 text-[0.64rem] font-semibold uppercase tracking-[0.18em] text-ink-soft";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("header.openMenu")}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={bottom ? "bottom-mobile-menu" : "mobile-menu"}
        className={
          bottom
            ? "flex min-h-16 flex-col items-center justify-center gap-1 transition-colors hover:text-forest-900 lg:hidden"
            : "header-icon-btn flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-soft hover:text-forest-900 lg:hidden"
        }
      >
        {bottom ? (
          <>
            <span className="tab-icon">
              <IconMenu className="h-5 w-5" />
            </span>
            <span>{t("header.menu")}</span>
          </>
        ) : (
          <IconMenu className="h-5 w-5" />
        )}
      </button>

      <Drawer
        open={open}
        onClose={closeMenu}
        label="Menu"
        side="left"
        className="lg:hidden"
        panelClassName="!w-[88%] max-w-[360px] !bg-ivory-50"
      >
        <div
          id={bottom ? "bottom-mobile-menu" : "mobile-menu"}
          className="flex min-h-full flex-col"
        >
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line/70 bg-ivory-50/90 px-4 py-3 backdrop-blur-xl supports-[backdrop-filter]:bg-ivory-50/75">
            <Link href="/" className="flex items-center gap-2.5" onClick={closeMenu}>
              <LogoMark className="h-8 w-auto" />
              <span
                lang="en"
                className="font-display text-[1.02rem] font-semibold tracking-[0.14em] text-forest-900"
              >
                PROSANTI
              </span>
            </Link>
            <button
              type="button"
              onClick={closeMenu}
              aria-label={t("header.closeMenu")}
              className="header-icon-btn flex h-10 w-10 items-center justify-center rounded-full text-ink-soft hover:bg-forest-50 hover:text-forest-900"
            >
              <IconClose className="h-5 w-5" />
            </button>
          </div>

          <div className="flex-1 px-3 pb-6 pt-3">
            {/* Language first: the one control a shopper who cannot read the
                current language needs before anything else. */}
            <div className="flex items-center gap-3 px-1" style={reveal(0)}>
              <span className="shrink-0 text-[0.64rem] font-semibold uppercase tracking-[0.18em] text-ink-soft">
                {t("mobileDrawer.language")}
              </span>
              <LanguageSwitcher variant="drawer" className="!w-auto flex-1" />
            </div>

            {/* Quick actions — the three things people open the menu for. */}
            <div className="mt-4 grid grid-cols-3 gap-2" style={reveal(1)}>
              <Link href="/account" onClick={closeMenu} className="drawer-tile">
                <IconUser className="h-5 w-5 text-forest-700" />
                {t("mobileDrawer.account")}
              </Link>
              <Link href="/wishlist" onClick={closeMenu} className="drawer-tile relative">
                <IconHeart className="h-5 w-5 text-forest-700" />
                {t("mobileDrawer.wishlist")}
                {wishlistCount > 0 && (
                  <span className="absolute right-2 top-2 flex h-[1.1rem] min-w-[1.1rem] items-center justify-center rounded-full bg-forest-900 px-1 text-[0.6rem] font-bold leading-none text-ivory-50">
                    {wishlistCount > 99 ? "99+" : wishlistCount}
                  </span>
                )}
              </Link>
              <Link href="/track" onClick={closeMenu} className="drawer-tile">
                <IconClock className="h-5 w-5 text-forest-700" />
                {t("footer.trackOrder")}
              </Link>
            </div>

            <nav aria-label="Primary mobile" className="mt-6">
              <p className={sectionTitle}>{t("mobileDrawer.discover")}</p>
              <ul className="flex flex-col gap-0.5">
                {PRIMARY.map((item, i) => {
                  const active = isCurrent(item.href);
                  return (
                    <li key={item.href} style={reveal(2 + i)}>
                      <Link
                        href={item.href}
                        onClick={closeMenu}
                        aria-current={active ? "page" : undefined}
                        className="drawer-row text-[0.98rem] font-medium"
                      >
                        <span className="drawer-row-icon">{item.icon}</span>
                        <span className="flex min-w-0 flex-1 items-center gap-2">
                          {item.label}
                          {"offer" in item && item.offer ? (
                            <span
                              aria-hidden="true"
                              className="inline-flex h-1.5 w-1.5 rounded-full bg-gold-500 shadow-[0_0_6px_var(--color-gold-400)]"
                            />
                          ) : null}
                        </span>
                        <IconChevron className="h-4 w-4 -rotate-90 opacity-40" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>

            {/* Every category with pieces, straight into the filtered shop.
                The heading is the jump to the home shelf (`/#collections`)
                — the same destination the desktop entry falls back to. */}
            <nav aria-label="Categories" className="mt-6">
              <Link
                href="/#collections"
                onClick={closeMenu}
                className="flex items-center justify-between gap-3 rounded-lg px-3 pb-2 text-[0.64rem] font-semibold uppercase tracking-[0.18em] text-ink-soft transition-colors hover:text-forest-900"
              >
                {t("nav.categories")}
                <IconArrowRight className="h-3.5 w-3.5 opacity-60" />
              </Link>
              {categoryEntries.length > 0 && (
                <ul className="flex flex-col gap-0.5">
                  {categoryEntries.map(({ category, count, href }, i) => {
                    const name = categoryLabel(category, lang);
                    const countLabel =
                      count === 1 ? t("home.piece") : fmt(t("home.pieces"), { count });
                    return (
                      <li key={category.id} style={reveal(6 + i)}>
                        <Link href={href} onClick={closeMenu} className="drawer-row">
                          <span className="relative block h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-ivory-200 ring-1 ring-line">
                            {category.image && (
                              <Image
                                src={category.image}
                                alt=""
                                fill
                                sizes="44px"
                                className="object-cover"
                              />
                            )}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span
                              lang={lang === "bn" ? "bn" : undefined}
                              className={`block truncate font-display text-[1.02rem] font-medium leading-tight text-forest-900 ${
                                lang === "bn" ? "font-bengali" : ""
                              }`}
                            >
                              {name}
                            </span>
                            <span className="mt-0.5 block text-[0.7rem] text-ink-soft">
                              {countLabel}
                            </span>
                          </span>
                          <IconChevron className="h-4 w-4 -rotate-90 opacity-40" />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </nav>

            <nav aria-label="Secondary mobile" className="mt-6">
              <p className={sectionTitle}>{t("mobileDrawer.help")}</p>
              <ul className="flex flex-col">
                {HELP.map((item, i) => (
                  <li key={item.href} style={reveal(10 + i)}>
                    <Link
                      href={item.href}
                      onClick={closeMenu}
                      className="flex min-h-11 items-center justify-between rounded-lg px-3 py-2 text-[0.92rem] text-ink transition-colors hover:bg-forest-50 hover:text-forest-900"
                    >
                      {item.label}
                      <IconChevron className="h-3.5 w-3.5 -rotate-90 opacity-35" />
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </div>

          <div className="border-t border-line/70 bg-ivory-100/70 px-5 py-5">
            <Link
              href="/contact"
              onClick={closeMenu}
              className="flex min-h-12 items-center justify-center gap-2 rounded-full bg-forest-900 px-5 text-sm font-medium text-ivory-50 transition-colors hover:bg-forest-800"
            >
              {t("mobileDrawer.customerCare")} <IconArrowRight className="h-4 w-4" />
            </Link>
            <p className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-ink-soft">
              <Link href="/shops/apply" onClick={closeMenu} className="underline-offset-4 hover:text-forest-900 hover:underline">
                {t("mobileDrawer.sellWithUs")}
              </Link>
              <span aria-hidden="true" className="h-1 w-1 rounded-full bg-gold-400" />
              <Link href="/rider/apply" onClick={closeMenu} className="underline-offset-4 hover:text-forest-900 hover:underline">
                {t("mobileDrawer.becomeRider")}
              </Link>
            </p>
            <p className="mt-3 text-center text-[0.62rem] font-medium uppercase tracking-[0.18em] text-ink-soft/70">
              {t("mobileDrawer.est")}
            </p>
          </div>
        </div>
      </Drawer>
    </>
  );
}
