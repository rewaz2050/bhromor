"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import LogoMark from "@/components/logo-mark";
import Drawer from "@/components/ui/drawer";
import { IconClose, IconMenu, IconPhone } from "@/components/ui/icons";

const LINKS = [
  { label: "Your Account", href: "/account" },
  { label: "Shop All", href: "/shop" },
  { label: "New Arrivals", href: "/shop?filter=new" },
  { label: "Collections", href: "/#collections" },
  { label: "Track Order", href: "/track" },
  { label: "Delivery Information", href: "/delivery" },
  { label: "Returns & Exchange", href: "/returns" },
  { label: "About PROSANTI", href: "/about" },
  { label: "Contact", href: "/contact" },
  { label: "FAQ", href: "/faq" },
];

export default function MobileNav({ bottom = false }: { bottom?: boolean }) {
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

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={bottom ? "bottom-mobile-menu" : "mobile-menu"}
        className={
          bottom
            ? "flex min-h-14 flex-col items-center justify-center gap-1 text-ink-soft lg:hidden"
            : "flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-forest-100 hover:text-forest-900 lg:hidden"
        }
      >
        <IconMenu className="h-5 w-5" />
        {bottom && <span className="text-[10px]">Menu</span>}
      </button>

      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        label="Menu"
        side="left"
        className="lg:hidden"
      >
        <div
          id={bottom ? "bottom-mobile-menu" : "mobile-menu"}
          className="flex min-h-full flex-col"
        >
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <Link
              href="/"
              className="flex items-center gap-2.5"
              onClick={() => setOpen(false)}
            >
              <LogoMark className="h-8 w-auto" />
              <span className="font-display text-lg font-semibold tracking-[0.12em] text-forest-900">
                PROSANTI
              </span>
            </Link>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close menu"
              className="flex h-10 w-10 items-center justify-center rounded-full text-ink-soft hover:bg-forest-100"
            >
              <IconClose />
            </button>
          </div>

          <nav aria-label="Mobile" className="flex flex-col px-2 py-3">
            {LINKS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="rounded-xl px-4 py-3 text-[0.95rem] font-medium text-ink transition-colors hover:bg-forest-100 hover:text-forest-900"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="mt-auto border-t border-line px-6 py-5">
            <p className="font-bengali text-sm text-forest-800">প্রশান্তি</p>
            <p className="mt-1 text-xs leading-5 text-ink-soft">
              Premium commerce &amp; rapid local delivery.
            </p>
            <a
              href="tel:+8801700000000"
              className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-forest-700"
            >
              <IconPhone className="h-4 w-4" /> 01700-000000
            </a>
          </div>
        </div>
      </Drawer>
    </>
  );
}
