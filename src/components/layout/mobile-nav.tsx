"use client";

import { useState } from "react";
import Link from "next/link";
import LogoMark from "@/components/logo-mark";
import { IconClose, IconMenu, IconPhone } from "@/components/ui/icons";

const LINKS = [
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

export default function MobileNav() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        className="flex h-11 w-11 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-forest-100 hover:text-forest-900 lg:hidden"
      >
        <IconMenu className="h-6 w-6" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button
            aria-label="Close menu"
            className="absolute inset-0 bg-forest-950/40 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 flex w-[86%] max-w-sm flex-col overflow-y-auto bg-ivory-50 shadow-2xl">
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
        </div>
      )}
    </>
  );
}
