"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useLiveCatalog } from "@/lib/use-live-catalog";

export interface NavItem {
  label: string;
  href: string;
}

/**
 * Desktop primary nav — refined premium bar.
 * - Pill-shaped links with clear active fill, generous padding.
 * - Shop owns a hover mega-panel with categories (standard e-com pattern).
 * - Offers dot pulses to feel intentional, not just another grey pill.
 * - Keyboard-friendly: group-hover + focus-within keep the mega open.
 */
export default function NavLinks({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const { categories } = useLiveCatalog();

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
      const isSale = params.get("filter") === "sale";
      if (query) return isSale;
      if (isSale) return false;
      const owned = ["/product", "/style", "/live", "/campaign"];
      return (
        owned.some((p) => pathname === p || pathname.startsWith(`${p}/`)) ||
        pathname === path ||
        pathname.startsWith(`${path}/`)
      );
    }
    return pathname === path || pathname.startsWith(`${path}/`);
  };

  // Use live categories if available, fallback to the three known ones
  const cats =
    categories.length > 0
      ? categories
      : ([
          { id: "men", name: "Men" },
          { id: "women", name: "Women" },
          { id: "traditional", name: "Traditional" },
        ] as { id: string; name: string }[]);

  return (
    <nav aria-label="Primary" className="hidden items-center gap-1 lg:flex">
      {items.map((item, index) => {
        const active = isActive(item.href);
        const isShop = item.href === "/shop";
        const isSale = item.href === "/shop?filter=sale";

        // Shop gets a mega-hover panel — standard for fashion commerce,
        // keeps the bar to 4-5 items while exposing the full taxonomy in one hover/tap.
        if (isShop) {
          return (
            <div
              key={item.href}
              className="group relative"
              style={
                {
                  animation: `storefront-reveal 520ms cubic-bezier(0.22,1,0.36,1) both`,
                  animationDelay: `${index * 45}ms`,
                } as React.CSSProperties
              }
            >
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                aria-haspopup="true"
                aria-expanded="false"
                className={`nav-editorial-link group/link relative inline-flex items-center whitespace-nowrap rounded-full px-4 py-2 text-[0.72rem] font-semibold uppercase tracking-[0.13em] transition-all duration-300 ${
                  active
                    ? "bg-forest-900 text-ivory-50 shadow-sm"
                    : "text-ink-soft hover:bg-forest-50 hover:text-forest-900"
                }`}
              >
                <span className="relative z-10">{item.label}</span>
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={`ml-1.5 h-3.5 w-3.5 opacity-60 transition-transform duration-300 group-hover/link:rotate-180 group-focus-within:rotate-180 ${
                    active ? "opacity-70" : ""
                  }`}
                >
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </Link>

              {/* Mega panel — hover + keyboard focus */}
              <div className="invisible absolute left-1/2 top-full z-30 -translate-x-1/2 pt-3 opacity-0 transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
                <div className="min-w-[560px] overflow-hidden rounded-2xl border border-line/60 bg-ivory-50 p-2 shadow-[0_16px_48px_-20px_rgba(12,25,19,0.22),0_4px_16px_-8px_rgba(12,25,19,0.08)]">
                  <div className="grid grid-cols-[1.05fr_1.35fr] gap-2">
                    {/* Quick shop */}
                    <div className="rounded-xl bg-paper p-4">
                      <p className="text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-ink-soft">
                        Shop
                      </p>
                      <div className="mt-3 flex flex-col gap-1">
                        <Link
                          href="/shop"
                          className="flex items-center justify-between rounded-xl px-3 py-2.5 text-sm font-medium text-forest-900 transition-colors hover:bg-forest-50"
                        >
                          All pieces
                          <span className="text-xs font-normal text-ink-soft">→</span>
                        </Link>
                        {items.some((i) => i.href === "/shop?filter=sale") && (
                          <Link
                            href="/shop?filter=sale"
                            className="flex items-center justify-between rounded-xl bg-gold-400/20 px-3 py-2.5 text-sm font-medium text-forest-900 ring-1 ring-gold-400/30 transition-colors hover:bg-gold-400/30"
                          >
                            <span className="inline-flex items-center gap-2">
                              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-gold-600" />
                              On sale
                            </span>
                            <span className="text-xs font-normal text-gold-700">→</span>
                          </Link>
                        )}
                        <Link
                          href="/shop?sort=newest"
                          className="flex items-center justify-between rounded-xl px-3 py-2.5 text-sm font-medium text-ink hover:bg-forest-50 hover:text-forest-900"
                        >
                          New arrivals
                          <span className="text-xs font-normal text-ink-soft">→</span>
                        </Link>
                        <Link
                          href="/shops"
                          className="flex items-center justify-between rounded-xl px-3 py-2.5 text-sm font-medium text-ink hover:bg-forest-50 hover:text-forest-900"
                        >
                          All shops
                          <span className="text-xs font-normal text-ink-soft">→</span>
                        </Link>
                      </div>
                    </div>

                    {/* Categories */}
                    <div className="rounded-xl bg-forest-950 p-4 text-ivory-100">
                      <p className="text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-gold-300">
                        Categories
                      </p>
                      <div className="mt-3 grid gap-1.5">
                        {cats.map((cat) => (
                          <Link
                            key={cat.id}
                            href={`/shop?category=${encodeURIComponent(cat.id)}`}
                            className="group/cat flex items-center justify-between rounded-xl px-3 py-2.5 text-sm font-medium text-ivory-100 transition-colors hover:bg-white/10 hover:text-white"
                          >
                            {cat.name}
                            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/10 text-ivory-200 transition-colors group-hover/cat:bg-ivory-50 group-hover/cat:text-forest-900">
                              <svg
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.8"
                                className="h-3.5 w-3.5"
                              >
                                <path d="M9 18 15 12 9 6" />
                              </svg>
                            </span>
                          </Link>
                        ))}
                      </div>
                      <Link
                        href="/#collections"
                        className="mt-3 flex items-center justify-center gap-1.5 rounded-full bg-white/10 py-2 text-xs font-medium tracking-wide text-ivory-100 transition-colors hover:bg-white hover:text-forest-900"
                      >
                        View all collections
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          className="h-3.5 w-3.5"
                        >
                          <path d="M5 12h14M13 6l6 6-6 6" />
                        </svg>
                      </Link>
                    </div>
                  </div>
                  <p className="px-3 pb-1 pt-2 text-center text-[0.68rem] leading-none text-ink-soft">
                    Free delivery insight on every product · Cash on delivery · 7-day exchange
                  </p>
                </div>
              </div>
            </div>
          );
        }

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`nav-editorial-link group relative inline-flex items-center whitespace-nowrap rounded-full px-3.5 py-2 text-[0.72rem] font-semibold uppercase tracking-[0.13em] transition-all duration-300 ${
              active
                ? "bg-forest-900 text-ivory-50 shadow-sm"
                : "text-ink-soft hover:bg-forest-50 hover:text-forest-900"
            }`}
            style={
              {
                animation: `storefront-reveal 520ms cubic-bezier(0.22,1,0.36,1) both`,
                animationDelay: `${index * 45}ms`,
              } as React.CSSProperties
            }
          >
            {isSale ? (
              <span
                aria-hidden="true"
                className="relative mr-1.5 inline-flex h-1.5 w-1.5 rounded-full bg-gold-500 shadow-[0_0_6px_var(--color-gold-400)]"
              >
                <span className="absolute inset-0 animate-ping rounded-full bg-gold-400 opacity-40" />
              </span>
            ) : null}
            <span className="relative z-10">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
