"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import CategoryMenu from "./category-menu";

export interface NavItem {
  label: string;
  href: string;
  /**
   * `categories` renders the entry as the drop-down category menu (desktop
   * only); `href` stays its no-catalog fallback.
   */
  menu?: "categories";
}

/**
 * Which entry owns a location. `/shop` owns the whole browsing surface
 * (product, style, live, campaign pages) except the sale view, which the
 * Offers entry owns exclusively. In-page anchors (`/#collections`) are jumps,
 * not destinations, so they are never "current" — lighting Categories on the
 * home page read as "you are on the categories page".
 */
export const isNavActive = (
  href: string,
  pathname: string | null,
  params: URLSearchParams,
): boolean => {
  if (!pathname) return false;
  if (href.includes("#")) return false;
  const [path, queryString] = href.split("?");
  if (!path || path === "/") return pathname === "/";
  if (
    queryString &&
    !Array.from(new URLSearchParams(queryString)).every(
      ([key, value]) => params.get(key) === value,
    )
  )
    return false;
  if (path === "/shop") {
    const isSale = params.get("filter") === "sale";
    if (queryString) return isSale;
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

/**
 * Desktop primary nav (menubar redesign, 2026-09-26): quiet labels, a soft
 * wash on hover and a gold hairline under the current section. Sizing per
 * script lives in globals.css (`.nav-editorial-link`, `:lang(bn)`).
 */
export default function NavLinks({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const params = useSearchParams();

  return (
    <nav aria-label="Primary" className="hidden items-center gap-0.5 lg:flex">
      {items.map((item, index) => {
        const revealStyle = {
          animation: `storefront-reveal 520ms cubic-bezier(0.22,1,0.36,1) both`,
          animationDelay: `${index * 45}ms`,
        } as React.CSSProperties;

        if (item.menu === "categories") {
          return (
            <CategoryMenu
              key={item.href}
              label={item.label}
              fallbackHref={item.href}
              style={revealStyle}
            />
          );
        }

        const active = isNavActive(item.href, pathname, params);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className="nav-editorial-link whitespace-nowrap"
            style={revealStyle}
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
