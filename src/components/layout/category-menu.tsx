"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { IconArrowRight, IconChevron } from "@/components/ui/icons";
import { useLanguage } from "@/components/i18n/language-provider";
import { useLiveCatalog } from "@/lib/use-live-catalog";
import { categoryMenuEntries } from "@/lib/category-menu";
import { categoryLabel, offerProducts } from "@/lib/home-shelves";

const fmt = (tpl: string, vars: Record<string, string | number>) =>
  Object.entries(vars).reduce(
    (s, [k, v]) => s.replaceAll(`{${k}}`, String(v)),
    tpl,
  );

/**
 * Desktop "Categories" entry of the menubar (2026-09-26).
 *
 * Standard storefront behaviour: hover (or click / Enter / ArrowDown) opens
 * a panel with every category that has pieces — photo, name, count and its
 * garment types — each a direct link into the filtered shop. Escape, a click
 * outside, focus leaving, or a navigation closes it. Touch and keyboard get
 * the same panel through the button.
 *
 * Before the live catalog answers there is nothing to list, so the entry is
 * the plain link it always was (`/#collections`, the home shelf).
 */
export default function CategoryMenu({
  label,
  fallbackHref,
  style,
}: {
  label: string;
  fallbackHref: string;
  style?: CSSProperties;
}) {
  const { t, lang } = useLanguage();
  const { products, categories } = useLiveCatalog();
  const entries = useMemo(
    () => categoryMenuEntries(products, categories),
    [products, categories],
  );
  const hasOffers = offerProducts(products).length > 0;

  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const timer = useRef<number | null>(null);
  const panelId = useId();

  const pathname = usePathname();
  const search = useSearchParams();
  const routeKey = `${pathname}?${search?.toString() ?? ""}`;

  const clearTimer = () => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  };
  const close = useCallback(() => {
    clearTimer();
    setOpen(false);
  }, []);

  // A navigation (route or query) closes the panel.
  const lastRoute = useRef(routeKey);
  useEffect(() => {
    if (lastRoute.current !== routeKey) {
      lastRoute.current = routeKey;
      setOpen(false);
    }
  }, [routeKey]);

  // Click / tap anywhere outside closes it.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) close();
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open, close]);

  useEffect(() => clearTimer, []);

  if (entries.length === 0) {
    return (
      <Link href={fallbackHref} className="nav-editorial-link" style={style}>
        <span className="relative z-10">{label}</span>
      </Link>
    );
  }

  // Hover intent: a short delay in, a longer grace period out so the pointer
  // can travel from the word down into the panel. Touch never hovers.
  const onPointerEnter = (event: ReactPointerEvent) => {
    if (event.pointerType === "touch") return;
    clearTimer();
    timer.current = window.setTimeout(() => setOpen(true), 80);
  };
  const onPointerLeave = (event: ReactPointerEvent) => {
    if (event.pointerType === "touch") return;
    clearTimer();
    timer.current = window.setTimeout(() => setOpen(false), 220);
  };

  const onKeyDown = (event: ReactKeyboardEvent) => {
    if (event.key === "Escape" && open) {
      event.preventDefault();
      close();
      triggerRef.current?.focus();
    } else if (event.key === "ArrowDown" && event.target === triggerRef.current) {
      event.preventDefault();
      setOpen(true);
      window.setTimeout(() => {
        panelRef.current?.querySelector<HTMLElement>("a[href]")?.focus();
      }, 0);
    }
  };

  const onBlur = (event: React.FocusEvent) => {
    if (!rootRef.current?.contains(event.relatedTarget as Node | null)) close();
  };

  const countLabel = (count: number) =>
    count === 1 ? t("home.piece") : fmt(t("home.pieces"), { count });

  return (
    <div
      ref={rootRef}
      className="relative"
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      onKeyDown={onKeyDown}
      onBlur={onBlur}
      data-testid="category-menu"
    >
      <button
        ref={triggerRef}
        type="button"
        className="nav-editorial-link"
        aria-expanded={open}
        aria-controls={panelId}
        aria-haspopup="true"
        onClick={() => {
          clearTimer();
          setOpen((v) => !v);
        }}
        style={style}
      >
        <span className="relative z-10">{label}</span>
        <IconChevron className="nav-chevron relative z-10" />
      </button>

      {open && (
        <div
          ref={panelRef}
          id={panelId}
          role="group"
          aria-label={t("categoryMenu.label")}
          className="category-panel p-3"
        >
          <ul
            className={`grid gap-1 ${
              entries.length >= 3 ? "grid-cols-3" : entries.length === 2 ? "grid-cols-2" : "grid-cols-1"
            }`}
          >
            {entries.map(({ category, count, href, subCategories }) => {
              const name = categoryLabel(category, lang);
              return (
                <li key={category.id} className="min-w-0">
                  <Link
                    href={href}
                    className="category-panel-tile group flex items-center gap-3 p-2"
                  >
                    <span className="relative block h-14 w-14 shrink-0 overflow-hidden rounded-md bg-ivory-200 ring-1 ring-line">
                      {category.image && (
                        <Image
                          src={category.image}
                          alt=""
                          fill
                          sizes="56px"
                          className="object-cover"
                        />
                      )}
                    </span>
                    <span className="min-w-0">
                      <span
                        lang={lang === "bn" ? "bn" : undefined}
                        className={`block truncate font-display text-[1.02rem] font-medium leading-tight text-forest-900 ${
                          lang === "bn" ? "font-bengali" : ""
                        }`}
                      >
                        {name}
                      </span>
                      <span className="mt-0.5 block text-[0.7rem] text-ink-soft">
                        {countLabel(count)}
                      </span>
                    </span>
                  </Link>
                  {subCategories.length > 0 && (
                    <ul className="mt-1 flex flex-wrap gap-x-1 gap-y-0.5 px-2 pb-2">
                      {subCategories.map((sub) => (
                        <li key={sub.name}>
                          <Link href={sub.href} className="category-panel-sub">
                            {sub.name}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>

          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-line/80 px-2 pt-3">
            <Link
              href="/shop"
              className="editorial-text-link group !min-h-9 text-[0.72rem] font-semibold"
            >
              {t("footer.allProducts")}
              <IconArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
            </Link>
            {hasOffers && (
              <Link
                href="/shop?filter=sale"
                className="inline-flex min-h-9 items-center gap-2 rounded-full bg-gold-100 px-3.5 text-[0.72rem] font-semibold text-gold-700 ring-1 ring-gold-300/70 transition-colors hover:bg-gold-200"
              >
                <span
                  aria-hidden="true"
                  className="inline-flex h-1.5 w-1.5 rounded-full bg-gold-500 shadow-[0_0_6px_var(--color-gold-400)]"
                />
                {t("nav.offers")}
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
