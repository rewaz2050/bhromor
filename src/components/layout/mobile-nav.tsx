"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import LogoMark from "@/components/logo-mark";
import Drawer from "@/components/ui/drawer";
import { IconArrowRight, IconCheck, IconClose, IconMenu } from "@/components/ui/icons";
import LanguageSwitcher from "./language-switcher";
import { useLanguage } from "@/components/i18n/language-provider";
import { useLiveCatalog } from "@/lib/use-live-catalog";
import { offerProducts } from "@/lib/home-shelves";

export default function MobileNav({ bottom = false }: { bottom?: boolean }) {
  const { t } = useLanguage();
  const { products } = useLiveCatalog();
  const hasOffers = offerProducts(products).length > 0;
  const PRIMARY = [
    { label: t("nav.shop"), href: "/shop" },
    ...(hasOffers ? [{ label: t("nav.offers"), href: "/shop?filter=sale" }] : []),
    { label: t("nav.shops"), href: "/shops" },
    { label: t("nav.categories"), href: "/#collections" },
    { label: t("nav.track"), href: "/track" },
  ];
  const SECONDARY_TRANSLATED = [
    { label: t("header.wishlist"), href: "/wishlist" },
    { label: t("footer.yourAccount"), href: "/account" },
    { label: t("footer.trackOrder"), href: "/track" },
    { label: t("footer.deliveryInfo"), href: "/delivery" },
    { label: t("footer.contact"), href: "/contact" },
    { label: t("footer.faq"), href: "/faq" },
  ];
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const lastPath = useRef(pathname);

  useEffect(() => {
    if (lastPath.current !== pathname) {
      lastPath.current = pathname;
      setOpen(false);
    }
  }, [pathname]);

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
            ? "flex w-full flex-col items-center justify-center gap-0.5 rounded-[16px] px-1 py-2 text-[10px] font-medium leading-none tracking-wide text-ink-soft transition-colors hover:bg-forest-50 hover:text-forest-900"
            : "header-icon-btn flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-soft hover:text-forest-900 lg:hidden"
        }
      >
        <span className="flex h-6 w-6 items-center justify-center">
          <IconMenu className="h-5 w-5" />
        </span>
        {bottom && <span className="tracking-wide">{t("header.menu")}</span>}
      </button>

      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        label="Menu"
        side="left"
        className="lg:hidden"
        panelClassName="!w-[88%] max-w-[360px] !bg-ivory-50"
      >
        <div
          id={bottom ? "bottom-mobile-menu" : "mobile-menu"}
          className="flex min-h-full flex-col"
        >
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line/60 bg-ivory-50/90 px-5 py-4 backdrop-blur-xl supports-[backdrop-filter]:bg-ivory-50/75">
            <Link
              href="/"
              className="flex items-center gap-2.5"
              onClick={() => setOpen(false)}
            >
              <LogoMark className="h-8 w-auto" />
              <span className="font-display text-[1.05rem] font-semibold tracking-[0.14em] text-forest-900">
                PROSANTI
              </span>
            </Link>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label={t("header.closeMenu")}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-forest-50 text-ink-soft transition-colors hover:bg-forest-100 hover:text-forest-900"
            >
              <IconClose className="h-5 w-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-5">
            <p className="px-3 pb-3 text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-ink-soft">
              {t("mobileDrawer.discover")}
            </p>
            <nav aria-label="Primary mobile" className="flex flex-col gap-2">
              {PRIMARY.map((item, i) => {
                const [path] = item.href.split("?");
                const active =
                  path === "/"
                    ? pathname === "/"
                    : pathname === path || pathname.startsWith(`${path}/`);
                const isSale = item.href.includes("filter=sale");
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={`group flex items-center justify-between rounded-2xl border px-4 py-3.5 text-[0.95rem] font-medium transition-all active:scale-[0.99] ${
                      active
                        ? "border-forest-900 bg-forest-900 text-ivory-50 shadow-sm"
                        : isSale
                          ? "border-gold-300/50 bg-gold-50 text-forest-900 hover:border-gold-400 hover:bg-gold-100"
                          : "border-line/60 bg-paper text-forest-900 hover:border-forest-200 hover:bg-forest-50"
                    }`}
                    style={
                      {
                        animation: open
                          ? `storefront-reveal 420ms cubic-bezier(0.22,1,0.36,1) both`
                          : undefined,
                        animationDelay: open ? `${80 + i * 40}ms` : undefined,
                      } as React.CSSProperties
                    }
                  >
                    <span className="inline-flex items-center gap-2">
                      {isSale && !active && (
                        <span className="h-2 w-2 animate-pulse rounded-full bg-gold-500" />
                      )}
                      {item.label}
                    </span>
                    <span
                      className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors ${
                        active
                          ? "bg-white/15 text-ivory-50"
                          : isSale
                            ? "bg-gold-500 text-white"
                            : "bg-forest-50 text-forest-600 group-hover:bg-forest-900 group-hover:text-ivory-50"
                      }`}
                    >
                      {active ? (
                        <IconCheck className="h-4 w-4" />
                      ) : (
                        <IconArrowRight className="h-4 w-4" />
                      )}
                    </span>
                  </Link>
                );
              })}
            </nav>

            {/* Categories shortcut — visible hierarchy */}
            <div className="mt-5 rounded-2xl border border-line/50 bg-paper p-3">
              <p className="px-2 pb-2 text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-ink-soft">
                Categories
              </p>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: "men", label: "Men", href: "/shop?category=men" },
                  { id: "women", label: "Women", href: "/shop?category=women" },
                  { id: "traditional", label: "Traditional", href: "/shop?category=traditional" },
                ].map((cat) => (
                  <Link
                    key={cat.id}
                    href={cat.href}
                    onClick={() => setOpen(false)}
                    className="flex flex-col items-center justify-center gap-1 rounded-xl bg-ivory-100 px-2 py-3 text-center text-sm font-medium text-forest-900 transition-colors hover:bg-forest-900 hover:text-ivory-50"
                  >
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-forest-700 shadow-sm">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-4 w-4">
                        <path d="M12 3.5 20 7.5v9l-8 4-8-4v-9Z" />
                        <path d="M4.5 7.8 12 11.5l7.5-3.7M12 11.5V20" />
                      </svg>
                    </span>
                    {cat.label}
                  </Link>
                ))}
              </div>
            </div>

            <div className="mt-5 px-1">
              <LanguageSwitcher variant="drawer" />
            </div>

            <div className="mt-6">
              <p className="px-3 pb-3 text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-ink-soft">
                {t("mobileDrawer.explore")}
              </p>
              <nav aria-label="Secondary mobile" className="flex flex-col rounded-2xl border border-line/40 bg-paper p-1">
                {SECONDARY_TRANSLATED.map((item, i) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className="flex items-center justify-between rounded-xl px-3 py-3 text-[0.92rem] font-[450] text-ink transition-colors hover:bg-forest-50 hover:text-forest-900"
                    style={
                      {
                        animation: open
                          ? `storefront-reveal 420ms cubic-bezier(0.22,1,0.36,1) both`
                          : undefined,
                        animationDelay: open ? `${220 + i * 30}ms` : undefined,
                      } as React.CSSProperties
                    }
                  >
                    {item.label}
                    <IconArrowRight className="h-3.5 w-3.5 opacity-35" />
                  </Link>
                ))}
              </nav>
            </div>
          </div>

          <div className="border-t border-line/60 bg-ivory-100/80 px-6 py-6 backdrop-blur-sm">
            <p className="font-bengali text-[1.05rem] font-medium leading-none text-forest-800">
              প্রশান্তি
            </p>
            <p className="mt-2 text-xs leading-5 text-ink-soft">
              {t("mobileDrawer.rooted")}
              <br />
              {t("mobileDrawer.premium")}
            </p>
            <Link
              href="/contact"
              onClick={() => setOpen(false)}
              className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-full bg-forest-900 px-5 text-sm font-medium text-ivory-50 transition-colors hover:bg-forest-800"
            >
              {t("mobileDrawer.customerCare")} <IconArrowRight className="h-4 w-4" />
            </Link>
            <p className="mt-4 text-[0.62rem] font-medium uppercase tracking-[0.18em] text-ink-soft/70">
              {t("mobileDrawer.est")}
            </p>
          </div>
        </div>
      </Drawer>
    </>
  );
}
