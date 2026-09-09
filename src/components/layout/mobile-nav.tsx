"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import LogoMark from "@/components/logo-mark";
import Drawer from "@/components/ui/drawer";
import { IconArrowRight, IconClose, IconMenu } from "@/components/ui/icons";
import LanguageSwitcher from "./language-switcher";
import { useLanguage } from "@/components/i18n/language-provider";

// keep original for reference fallback
const SECONDARY_FALLBACK = [
  { label: "Wishlist", href: "/wishlist" },
  { label: "Your Account", href: "/account" },
  { label: "Track Order", href: "/track" },
  { label: "Delivery & Returns", href: "/delivery" },
  { label: "Contact", href: "/contact" },
  { label: "FAQ", href: "/faq" },
];

export default function MobileNav({ bottom = false }: { bottom?: boolean }) {
  const { t, lang } = useLanguage();
  const PRIMARY = [
    { label: t("nav.shop"), href: "/shop" },
    { label: t("nav.shops"), href: "/shops" },
    { label: t("nav.collections"), href: "/#collections" },
  ];
  // Secondary labels also translated where possible
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

  // Close on navigation — otherwise the panel stayed open over the new page.
  useEffect(() => {
    if (lastPath.current !== pathname) {
      lastPath.current = pathname;
      setOpen(false);
    }
  }, [pathname]);

  // Lock focus return already handled by Drawer; also animate links on open
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
            ? "flex min-h-14 flex-col items-center justify-center gap-1 text-ink-soft transition-colors hover:text-forest-900 lg:hidden"
            : "header-icon-btn flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-soft hover:text-forest-900 lg:hidden"
        }
      >
        <IconMenu className="h-5 w-5" />
        {bottom && <span className="text-[10px] font-medium tracking-wide">{t("header.menu")}</span>}
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
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line/70 bg-ivory-50/85 px-5 py-4 backdrop-blur-xl supports-[backdrop-filter]:bg-ivory-50/70">
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
              className="header-icon-btn flex h-10 w-10 items-center justify-center rounded-full text-ink-soft hover:bg-forest-50 hover:text-forest-900"
            >
              <IconClose className="h-5 w-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-4">
            <p className="px-3 pb-3 text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-ink-soft">
              {t("mobileDrawer.discover")}
            </p>
            <nav aria-label="Primary mobile" className="flex flex-col gap-1">
              {PRIMARY.map((item, i) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="group flex items-center justify-between rounded-2xl bg-forest-950 px-4 py-4 text-[0.98rem] font-medium text-ivory-50 transition-all hover:bg-forest-900 active:scale-[0.99]"
                  style={{
                    animation: open ? `storefront-reveal 420ms cubic-bezier(0.22,1,0.36,1) both` : undefined,
                    animationDelay: open ? `${80 + i * 40}ms` : undefined,
                  } as React.CSSProperties}
                >
                  <span>{item.label}</span>
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-ivory-50/12 text-ivory-200 transition-transform group-hover:translate-x-0.5 group-hover:bg-ivory-50 group-hover:text-forest-900">
                    <IconArrowRight className="h-4 w-4" />
                  </span>
                </Link>
              ))}
            </nav>

            <div className="mt-5 px-1">
              <LanguageSwitcher variant="drawer" />
            </div>

            <div className="mt-6">
              <p className="px-3 pb-3 text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-ink-soft">
                {t("mobileDrawer.explore")}
              </p>
              <nav aria-label="Secondary mobile" className="flex flex-col">
                {SECONDARY_TRANSLATED.map((item, i) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className="flex items-center justify-between rounded-xl px-3 py-3.5 text-[0.92rem] font-[450] text-ink transition-colors hover:bg-forest-50 hover:text-forest-900"
                    style={{
                      animation: open ? `storefront-reveal 420ms cubic-bezier(0.22,1,0.36,1) both` : undefined,
                      animationDelay: open ? `${220 + i * 30}ms` : undefined,
                    } as React.CSSProperties}
                  >
                    {item.label}
                    <IconArrowRight className="h-3.5 w-3.5 opacity-40" />
                  </Link>
                ))}
              </nav>
            </div>
          </div>

          <div className="border-t border-line/70 bg-ivory-100/70 px-6 py-6 backdrop-blur-sm">
            <p className="font-bengali text-[1.05rem] font-medium leading-none text-forest-800">
              প্রশান্তি
            </p>
            <p className="mt-2 text-xs leading-5 text-ink-soft">
              {t("mobileDrawer.rooted")}<br />
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
