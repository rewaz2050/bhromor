import Link from "next/link";
import LogoMark from "@/components/logo-mark";
import Newsletter, { newsletterSignupUrl } from "./newsletter";
import {
  IconArrowRight,
  IconMapPin,
  IconShield,
  IconTruck,
} from "@/components/ui/icons";

const SHOP_LINKS = [
  { label: "All Products", href: "/shop" },
  { label: "Men", href: "/shop?category=men" },
  { label: "Women", href: "/shop?category=women" },
  { label: "Traditional", href: "/shop?category=traditional" },
  { label: "New Arrivals", href: "/shop?filter=new" },
];

const HELP_LINKS = [
  { label: "Your Account", href: "/account" },
  { label: "Track Order", href: "/track" },
  { label: "Delivery Information", href: "/delivery" },
  { label: "Returns & Exchange", href: "/returns" },
  { label: "FAQ", href: "/faq" },
  { label: "Contact", href: "/contact" },
];

const COMPANY_LINKS = [
  { label: "Our Story", href: "/about" },
  { label: "Visual Journal", href: "/#journal" },
  { label: "Privacy Policy", href: "/privacy" },
  { label: "Terms & Conditions", href: "/terms" },
];

export default function Footer() {
  const signupUrl = newsletterSignupUrl(process.env.NEWSLETTER_SIGNUP_URL);

  return (
    <footer className="bg-forest-950 text-ivory-100">
      {signupUrl && (
        <div className="border-b border-white/15">
          <div className="mx-auto grid max-w-7xl items-center gap-7 px-6 py-12 sm:px-8 lg:grid-cols-2 lg:gap-16 lg:py-14">
            <div>
              <p className="text-[0.6rem] font-medium uppercase tracking-[0.25em] text-gold-300">
                Join the PROSANTI list
              </p>
              <h2 className="mt-4 font-display text-3xl font-normal sm:text-4xl">
                Stay close to{" "}
                <span className="italic text-gold-200">PROSANTI.</span>
              </h2>
              <p className="mt-3 max-w-md text-sm leading-7 text-ivory-100/65">
                New collections and considered stories, delivered occasionally.
              </p>
            </div>
            <Newsletter signupUrl={signupUrl} />
          </div>
        </div>
      )}

      {/* Assurance strip — what shopping with PROSANTI feels like */}
      <div className="border-b border-white/10">
        <div className="mx-auto grid max-w-7xl gap-6 px-4 py-8 sm:grid-cols-3 sm:px-6 lg:px-8">
          {[
            {
              icon: <IconShield className="h-5 w-5 text-gold-300" />,
              title: "Cash on delivery",
              text: "Pay when the parcel reaches your door.",
            },
            {
              icon: <IconTruck className="h-5 w-5 text-gold-300" />,
              title: "Instant delivery",
              text: "Arrives in 45–50 min inside the service area.",
            },
            {
              icon: <IconMapPin className="h-5 w-5 text-gold-300" />,
              title: "7-day easy exchange",
              text: "Unworn pieces exchanged without fuss.",
            },
          ].map((item) => (
            <div key={item.title} className="flex items-start gap-3">
              <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/5 ring-1 ring-white/10">
                {item.icon}
              </span>
              <span>
                <span className="block text-sm font-medium text-ivory-100">
                  {item.title}
                </span>
                <span className="mt-0.5 block text-xs leading-5 text-ivory-100/60">
                  {item.text}
                </span>
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Main columns */}
      <div className="mx-auto grid max-w-7xl grid-cols-2 gap-x-6 gap-y-10 px-4 py-12 sm:px-6 lg:grid-cols-5 lg:px-8">
        <div className="col-span-2">
          <div className="flex items-center gap-3">
            {/* Cream tile keeps the dark emblem visible on the dark footer */}
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-ivory-100">
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
            Rooted in Bangladesh. Designed for today. Thoughtfully made
            essentials, with care in every detail.
          </p>
          <div className="mt-6 space-y-2 text-sm text-ivory-100/70">
            <Link
              href="/contact"
              className="flex items-center gap-2.5 transition-colors hover:text-gold-300"
            >
              Customer care &amp; enquiries
              <IconArrowRight className="h-4 w-4 text-gold-400" />
            </Link>
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

      <div className="border-t border-white/10 px-4 pb-24 pt-6 sm:px-6 lg:px-8 lg:pb-6">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 text-xs text-ivory-100/50 sm:flex-row">
          <p>© 2026 PROSANTI · prosanti.store — All rights reserved.</p>
          <p className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-gold-400" />
              Cash on Delivery
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-gold-400" />
              Instant delivery · 45–50 min
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
