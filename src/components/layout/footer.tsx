import Link from "next/link";
import LogoMark from "@/components/logo-mark";
import Newsletter from "./newsletter";
import { IconPhone, IconMapPin } from "@/components/ui/icons";

const SHOP_LINKS = [
  { label: "All Products", href: "/shop" },
  { label: "Men", href: "/shop?category=men" },
  { label: "Women", href: "/shop?category=women" },
  { label: "Traditional", href: "/shop?category=traditional" },
  { label: "New Arrivals", href: "/shop?filter=new" },
];

const HELP_LINKS = [
  { label: "Track Order", href: "/track" },
  { label: "Delivery Information", href: "/delivery" },
  { label: "Returns & Exchange", href: "/returns" },
  { label: "FAQ", href: "/faq" },
  { label: "Contact", href: "/contact" },
];

const COMPANY_LINKS = [
  { label: "About PROSANTI", href: "/about" },
  { label: "Privacy Policy", href: "/privacy" },
  { label: "Terms & Conditions", href: "/terms" },
];

export default function Footer() {
  return (
    <footer className="bg-forest-950 text-ivory-100">
      {/* Newsletter band */}
      <div className="border-b border-white/10 px-4 py-12 text-center sm:px-6">
        <p className="text-[0.7rem] font-semibold uppercase tracking-[0.38em] text-gold-300">
          Stay close
        </p>
        <h2 className="font-display mt-3 text-2xl font-medium sm:text-3xl">
          New collections, first.
        </h2>
        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-ivory-100/70">
          A short note when something beautiful arrives — nothing noisy, ever.
        </p>
        <Newsletter />
      </div>

      {/* Main columns */}
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:grid-cols-2 sm:px-6 lg:grid-cols-5 lg:px-8">
        <div className="lg:col-span-2">
          <div className="flex items-center gap-3">
            {/* Cream tile keeps the dark emblem visible on the dark footer */}
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-ivory-100">
              <LogoMark className="h-[2.15rem] w-auto" />
            </span>
            <span className="flex flex-col leading-none">
              <span className="font-display text-2xl font-semibold tracking-[0.14em]">
                PROSANTI
              </span>
              <span className="font-bengali mt-1 text-[0.65rem] tracking-wide text-ivory-100/60">
                প্রশান্তি
              </span>
            </span>
          </div>
          <p className="mt-5 max-w-sm text-sm leading-6 text-ivory-100/70">
            Premium commerce and rapid local delivery. Discover considered
            products, order in a minute, and know where your order is until it
            reaches your door.
          </p>
          <div className="mt-6 space-y-2 text-sm text-ivory-100/70">
            <a
              href="tel:+8801700000000"
              className="flex items-center gap-2.5 transition-colors hover:text-gold-300"
            >
              <IconPhone className="h-4 w-4 text-gold-400" />
              01700-000000 (Sat–Thu, 9am–9pm)
            </a>
            <p className="flex items-start gap-2.5">
              <IconMapPin className="mt-0.5 h-4 w-4 shrink-0 text-gold-400" />
              Launching inside a selected service area in Bangladesh — zones
              expand as delivery capacity grows.
            </p>
          </div>
        </div>

        <FooterCol title="Shop" links={SHOP_LINKS} />
        <FooterCol title="Help" links={HELP_LINKS} />
        <FooterCol title="Company" links={COMPANY_LINKS} />
      </div>

      <div className="border-t border-white/10 px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 text-xs text-ivory-100/50 sm:flex-row">
          <p>© 2026 PROSANTI · prosanti.store — All rights reserved.</p>
          <p className="flex items-center gap-4">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-gold-400" />
              Cash on Delivery
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-gold-400" />
              45–50 min rapid delivery
            </span>
          </p>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({
  title,
  links,
}: {
  title: string;
  links: { label: string; href: string }[];
}) {
  return (
    <nav aria-label={title}>
      <h3 className="text-[0.72rem] font-semibold uppercase tracking-[0.3em] text-gold-300">
        {title}
      </h3>
      <ul className="mt-5 space-y-3">
        {links.map((link) => (
          <li key={link.href + link.label}>
            <Link
              href={link.href}
              className="text-sm text-ivory-100/70 transition-colors hover:text-white"
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
