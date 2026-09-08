import Link from "next/link";
import LogoMark from "@/components/logo-mark";
import CartButton from "./cart-button";
import MobileNav from "./mobile-nav";
import { IconSearch } from "@/components/ui/icons";

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
      {/* Announcement bar */}
      <div className="bg-forest-950 px-4 py-2 text-center text-[0.72rem] font-medium tracking-wide text-ivory-100">
        <p className="mx-auto max-w-4xl">
          Rapid local delivery ·{" "}
          <span className="text-gold-300">45–50 min</span> inside the service
          area &nbsp;·&nbsp; Cash on Delivery available
        </p>
      </div>

      <div className="border-b border-line bg-ivory-50/90 backdrop-blur supports-[backdrop-filter]:bg-ivory-50/75">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6 lg:px-8">
          <MobileNav />

          {/* Brand lockup */}
          <Link
            href="/"
            className="group flex items-center gap-3"
            aria-label="PROSANTI home"
          >
            <LogoMark className="h-10 w-auto transition-transform duration-300 group-hover:scale-105" />
            <span className="flex flex-col leading-none">
              <span className="font-display text-xl font-semibold tracking-[0.14em] text-forest-900">
                PROSANTI
              </span>
              <span className="font-bengali mt-1 text-[0.6rem] tracking-wide text-ink-soft">
                প্রশান্তি
              </span>
            </span>
          </Link>

          {/* Desktop nav */}
          <nav
            aria-label="Primary"
            className="ml-8 hidden items-center gap-7 lg:flex"
          >
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="text-sm font-medium text-ink-soft transition-colors hover:text-forest-800"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-1.5">
            <Link
              href="/shop"
              aria-label="Search products"
              className="flex h-11 w-11 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-forest-100 hover:text-forest-900"
            >
              <IconSearch className="h-[1.15rem] w-[1.15rem]" />
            </Link>
            <CartButton />
          </div>
        </div>
      </div>
    </header>
  );
}
