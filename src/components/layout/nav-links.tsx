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
    if (path === "/shop") {
      // The sale pill owns /shop?filter=sale exclusively.
      const isSale = params.get("filter") === "sale";
      if (query) return isSale;
      if (isSale) return false;
      // Same ownership the thumb bar uses: a product page is still "shopping".
      const owned = ["/product", "/style", "/live", "/campaign"];
      return (
        owned.some((p) => pathname === p || pathname.startsWith(`${p}/`)) ||
        pathname === path ||
        pathname.startsWith(`${path}/`)
      );
    }
    return pathname === path || pathname.startsWith(`${path}/`);
  };

  return (
    <nav
      aria-label="Primary"
      className="hidden items-center gap-1.5 lg:flex"
    >
      {items.map((item, index) => {
        const active = isActive(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`nav-editorial-link group relative whitespace-nowrap text-[0.72rem] font-semibold uppercase tracking-[0.13em] transition-colors duration-300 ${
              active
                ? "text-ivory-50"
                : "text-ink-soft hover:text-forest-900"
            }`}
            style={{
              animation: `storefront-reveal 520ms cubic-bezier(0.22,1,0.36,1) both`,
              animationDelay: `${index * 45}ms`,
            } as React.CSSProperties}
          >
            {item.href === "/shop?filter=sale" ? (
              <span
                aria-hidden="true"
                className="relative z-10 mr-1.5 inline-flex h-1.5 w-1.5 rounded-full bg-gold-500 shadow-[0_0_6px_var(--color-gold-400)]"
              />
            ) : null}
            <span className="relative z-10">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
