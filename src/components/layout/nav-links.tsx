"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export interface NavItem {
  label: string;
  href: string;
}

/**
 * Desktop primary nav. Client-side so the current page can be marked with
 * `aria-current` and a visible underline — previously nothing indicated
 * where the visitor was.
 */
export default function NavLinks({ items }: { items: NavItem[] }) {
  const pathname = usePathname();

  const isActive = (href: string) => {
    const [path] = href.split(/[?#]/);
    if (!path || path === "/") return false;
    return pathname === path || pathname.startsWith(`${path}/`);
  };

  return (
    <nav
      aria-label="Primary"
      className="ml-auto hidden items-center gap-6 lg:flex"
    >
      {items.map((item) => {
        const active = isActive(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`whitespace-nowrap text-[0.65rem] font-medium uppercase tracking-[0.13em] transition-colors ${
              active
                ? "text-forest-900 underline decoration-gold-400 decoration-2 underline-offset-8"
                : "text-ink-soft hover:text-forest-800"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
