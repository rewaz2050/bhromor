"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

export interface NavItem {
  label: string;
  href: string;
}

/**
 * Desktop primary nav — premium editorial pills.
 * Active state uses filled forest pill with ivory text,
 * hover uses subtle forest-50 wash + expanding gold underline.
 */
export default function NavLinks({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const params = useSearchParams();

  const isActive = (href: string) => {
    const [path] = href.split(/[?#]/);
    if (!path || path === "/") return pathname === "/";
    const query = href.split("?")[1];
    if (
      query &&
      !Array.from(new URLSearchParams(query)).every(
        ([key, value]) => params.get(key) === value,
      )
    )
      return false;
    return pathname === path || pathname.startsWith(`${path}/`);
  };

  return (
    <nav
      aria-label="Primary"
      className="ml-auto hidden items-center gap-1.5 lg:flex"
    >
      {items.map((item, index) => {
        const active = isActive(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`nav-editorial-link group relative whitespace-nowrap text-[0.66rem] font-[550] uppercase tracking-[0.14em] transition-colors duration-300 ${
              active
                ? "text-ivory-50"
                : "text-ink-soft hover:text-forest-900"
            }`}
            style={{
              animation: `storefront-reveal 520ms cubic-bezier(0.22,1,0.36,1) both`,
              animationDelay: `${index * 45}ms`,
            } as React.CSSProperties}
          >
            <span className="relative z-10">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
