"use client";

import { productHref } from "@/lib/product-url";
import { useEffect, useId, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Drawer from "@/components/ui/drawer";
import { IconArrowRight, IconClose, IconSearch } from "@/components/ui/icons";
import { useLiveCatalog } from "@/lib/use-live-catalog";
import { formatBdt } from "@/lib/format";
import { matchesProduct, shopSearchHref } from "@/lib/product-search";
import { clearRecentSearches, getRecentSearches, rememberSearch } from "@/lib/recent-searches";
import { useSupportWhatsApp } from "@/lib/use-support-contact";
import { waLink } from "@/lib/whatsapp-order";
import { coverImage, type Product } from "@/lib/catalog";
import { useLanguage } from "@/components/i18n/language-provider";
import { categoryMenuEntries } from "@/lib/category-menu";
import { bnDigits } from "@/lib/arrival";
import { track } from "@/lib/analytics";

/** UX plan §0 — a typed query counts once it has rested for this long. */
const SEARCH_SETTLE_MS = 800;

/** Quick chips — the words people type most, in the language they read.
 *  Either spelling finds the same products (lib/product-search synonyms). */
const QUICK_TERMS: readonly { en: string; bn: string }[] = [
  { en: "Panjabi", bn: "পাঞ্জাবি" },
  { en: "Shirt", bn: "শার্ট" },
  { en: "Lungi", bn: "লুঙ্গি" },
  { en: "Gamcha", bn: "গামছা" },
  { en: "Three-Piece", bn: "থ্রি-পিস" },
];

/** Zero-result fallback: featured pieces you can actually buy. */
const suggestedPieces = (products: Product[], limit = 3): Product[] => {
  const featured = products.filter((p) => p.inStock && p.featured);
  const rest = products.filter((p) => p.inStock && !p.featured);
  return [...featured, ...rest].slice(0, limit);
};

export default function ProductSearch() {
  const { t, lang } = useLanguage();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const digits = (n: number) => lang === "bn" ? bnDigits(String(n)) : String(n);
  const router = useRouter();
  const { products: PRODUCTS, categories: CATEGORIES, shops, loading, retry } =
    useLiveCatalog();
  const searching = query.trim().length > 0;
  const catalogLoading = loading && PRODUCTS.length === 0;
  const catalogEmpty = !catalogLoading && PRODUCTS.length === 0;
  const categoryEntries = categoryMenuEntries(PRODUCTS, CATEGORIES, 0);
  const quickTerms = QUICK_TERMS.filter(term => PRODUCTS.some(product => matchesProduct(product, term.en) || matchesProduct(product, term.bn)));
  const chooseQuery = (value: string) => { setQuery(value); inputRef.current?.focus(); };
  const matches = searching
    ? PRODUCTS.filter((product) => matchesProduct(product, query))
    : [];
  const alternatives = suggestedPieces(PRODUCTS);
  const suggestions = searching
    ? matches.slice(0, 5)
    : PRODUCTS.filter((product) => product.featured).slice(0, 3);
  const close = () => setOpen(false);

  /* UX plan §1.2 — recent searches live on this device only; a query is
     remembered when it is acted on (submit, result tap), not while typing. */
  const [recent, setRecent] = useState<string[]>([]);
  const remember = (q: string) => setRecent(rememberSearch(q));
  const noMatches = searching && !catalogLoading && !catalogEmpty && matches.length === 0;
  const supportNumber = useSupportWhatsApp(open && noMatches);
  const askHref = supportNumber
    ? waLink(supportNumber, t("header.askWhatsAppMessage").replace("{q}", query.trim()))
    : null;

  /* `search` event: the settled query + how many products it found, so the
     Reports funnel can list zero-result searches (= demand we don't stock).
     Deduped per opened overlay; the form submit flushes the pending one. */
  const lastTracked = useRef("");
  const matchCount = matches.length;
  const trimmed = query.trim().toLowerCase();
  useEffect(() => {
    if (!open || catalogLoading || catalogEmpty || trimmed.length < 2 || trimmed === lastTracked.current) return;
    const timer = window.setTimeout(() => {
      lastTracked.current = trimmed;
      track({ type: "search", query: trimmed, results: matchCount });
    }, SEARCH_SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, [open, trimmed, matchCount, catalogLoading, catalogEmpty]);
  const trackSubmit = () => {
    if (catalogLoading || catalogEmpty || trimmed.length < 2 || trimmed === lastTracked.current) return;
    lastTracked.current = trimmed;
    track({ type: "search", query: trimmed, results: matchCount });
  };

  const openSearch = () => {
    lastTracked.current = "";
    setQuery("");
    setRecent(getRecentSearches());
    setOpen(true);
  };

  return (
    <>
      {/* One trigger, two looks (CSS): a round icon where the bar is tight,
          and from xl up a field-shaped button showing the placeholder —
          people recognise an input at a glance; a lone magnifier is a guess. */}
      <button
        type="button"
        aria-label={t("header.searchProducts")}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={openSearch}
        className="header-search-trigger"
      >
        <IconSearch className="h-[1.15rem] w-[1.15rem] shrink-0" />
        <span className="header-search-label">{t("header.searchPlaceholder")}</span>
      </button>
      <Drawer
        open={open}
        onClose={close}
        label={t("header.searchProducts")}
        side="right"
        initialFocusRef={inputRef}
        panelClassName="!w-full !max-w-none lg:px-[max(2rem,calc((100vw-900px)/2))]"
      >
        <div className="sticky top-0 z-10 border-b border-line bg-ivory-50 px-5 pb-5 pt-6 sm:px-8">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <p className="text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-ink-soft">
                {t("header.searchSubtitle")}
              </p>
              <h2 className="mt-2 font-display text-2xl text-forest-900">
                {t("header.searchTitle")}
              </h2>
            </div>
            <button
              type="button"
              onClick={close}
              aria-label={t("header.closeSearch")}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-forest-100"
            >
              <IconClose />
            </button>
          </div>
          <form
            role="search"
            onSubmit={(event) => {
              event.preventDefault();
              trackSubmit();
              remember(query);
              router.push(shopSearchHref(query));
              close();
            }}
          >
            <label htmlFor={inputId} className="sr-only">
              {t("header.searchInputLabel")}
            </label>
            <div className="flex items-center gap-2 rounded-2xl bg-paper px-3 ring-1 ring-line focus-within:ring-2 focus-within:ring-forest-500">
              <IconSearch className="h-5 w-5 shrink-0 text-ink-soft" />
              <input
                ref={inputRef}
                id={inputId}
                aria-describedby={`${inputId}-hint`}
                enterKeyHint="search"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("header.searchPlaceholder")}
                autoComplete="off"
                className="search-query h-14 min-w-0 flex-1 [&::-webkit-search-cancel-button]:appearance-none bg-transparent text-base text-ink outline-none focus-visible:outline-none"
              />
              {searching && (
                <button type="button" onClick={() => chooseQuery("")} aria-label={t("header.clearQuery")} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-soft hover:bg-forest-100">
                  <IconClose className="h-4 w-4" />
                </button>
              )}
              <button
                type="submit"
                aria-label={t("header.viewSearchResults")}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-forest-800 text-ivory-50 hover:bg-forest-700"
              >
                <IconArrowRight />
              </button>
            </div>
            <p id={`${inputId}-hint`} className="mt-3 text-xs text-ink-soft">{t("header.searchHint")}</p>
          </form>
        </div>
        <div className="flex-1 px-5 py-6 sm:px-8">
          {!searching && recent.length > 0 && (
            <div className="mb-8" data-testid="recent-searches">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="text-xs font-semibold uppercase tracking-widest text-ink-soft">
                  {t("header.recentSearches")}
                </h3>
                <button
                  type="button"
                  onClick={() => setRecent(clearRecentSearches())}
                  className="min-h-11 px-2 text-xs font-medium text-ink-soft underline-offset-4 hover:text-forest-800 hover:underline"
                >
                  {t("header.clearRecent")}
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {recent.map((term) => (
                  <button
                    key={term}
                    type="button"
                    onClick={() => chooseQuery(term)}
                    className="inline-flex min-h-11 max-w-full items-center gap-2 rounded-full bg-paper px-4 text-sm text-forest-900 ring-1 ring-line hover:bg-forest-100"
                  >
                    <IconSearch className="h-3.5 w-3.5 shrink-0 text-ink-soft" />
                    <span className="truncate">{term}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {!searching && categoryEntries.length > 0 && (
            <div className="mb-8">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-ink-soft">
                {t("header.exploreCollections")}
              </h3>
              <div className="flex flex-wrap gap-2">
                {categoryEntries.map(({ category }) => (
                  <Link
                    key={category.id}
                    href={`/shop?category=${encodeURIComponent(category.id)}`}
                    onClick={close}
                    className="rounded-full px-4 py-3 text-sm text-forest-800 ring-1 ring-line hover:bg-forest-100"
                  >
                    {lang === "bn" ? category.nameBn : category.name}
                  </Link>
                ))}
              </div>
            </div>
          )}
          {!searching && quickTerms.length > 0 && (
            <div className="mb-8">
              <h3 className="mb-3 text-xs uppercase tracking-widest text-ink-soft">
                {t("header.findEssentials")}
              </h3>
              <div className="flex flex-wrap gap-2">
                {quickTerms.map((term) => {
                  const label = lang === "bn" ? term.bn : term.en;
                  return (
                    <button
                      key={term.en}
                      type="button"
                      onClick={() => chooseQuery(label)}
                      className="min-h-11 border border-line px-4 text-sm hover:bg-forest-100"
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <p
            role="status"
            aria-live="polite"
            className="mb-4 break-words text-sm text-ink-soft"
          >
            {catalogLoading ? t("header.catalogLoading") : catalogEmpty ? t("header.catalogEmpty") : searching
              ? (matches.length === 1 ? t("header.matchFor") : t("header.matchesFor"))
                  .replace("{n}", digits(matches.length))
                  .replace("{q}", query.trim())
              : t("header.fewFavourites")}
          </p>
          {catalogLoading ? (
            <p className="py-6 text-sm text-ink-soft">{t("header.catalogLoadingHint")}</p>
          ) : catalogEmpty ? (
            <div className="rounded-2xl bg-ivory-100 px-5 py-6 text-sm text-ink-soft">
              <p>{t("header.catalogEmptyHint")}</p>
              {retry && <button type="button" onClick={() => { inputRef.current?.focus(); void retry(); }} className="mt-4 inline-flex min-h-11 items-center rounded-full bg-forest-800 px-5 text-sm font-semibold text-ivory-50">{t("header.retryCatalog")}</button>}
              <Link href="/contact" onClick={close} className="mt-3 inline-flex min-h-11 items-center text-forest-800 underline underline-offset-4">{t("track.contactSupport")}</Link>
            </div>
          ) : noMatches ? (
            <div className="rounded-2xl bg-ivory-100 px-5 py-8 text-center">
              <h3 className="font-display text-xl text-forest-900">
                {t("header.noMatches")}
              </h3>
              <p className="mt-2 text-sm leading-6 text-ink-soft">
                {t("header.noMatchesText")}
              </p>
              <Link
                href="/shop"
                onClick={close}
                className="mt-5 inline-flex min-h-11 items-center font-medium text-forest-800 underline underline-offset-4"
              >
                {t("header.browseAll")}
              </Link>
              {askHref ? (
                <div>
                  <a
                    href={askHref}
                    target="_blank"
                    rel="noreferrer"
                    data-testid="search-ask-whatsapp"
                    className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-full bg-forest-800 px-5 text-sm font-semibold text-ivory-50 hover:bg-forest-700"
                  >
                    {t("header.askWhatsApp")}
                  </a>
                </div>
              ) : null}
              {/* Featured/in-stock alternatives, not a claim of real sales. */}
              {alternatives.length > 0 ? (
                <div className="mt-6 text-left" data-testid="search-popular">
                  <h4 className="mb-2 text-xs font-semibold uppercase tracking-widest text-ink-soft">
                    {t("header.popularNow")}
                  </h4>
                  <ul className="divide-y divide-line">
                    {alternatives.map((product) => (
                      <li key={product.id}>
                        <Link
                          href={productHref(product, shops)}
                          onClick={close}
                          className="flex min-h-11 items-center justify-between gap-3 py-2 text-sm text-forest-900 hover:underline"
                        >
                          <span className="truncate">
                            {lang === "bn" && product.nameBn ? product.nameBn : product.name}
                          </span>
                          <span className="shrink-0 font-medium">{formatBdt(product.price)}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {suggestions.map((product) => (
                <li key={product.id}>
                  <Link
                    href={productHref(product, shops)}
                    onClick={() => {
                      if (searching) remember(query);
                      close();
                    }}
                    className="group flex items-center gap-4 rounded-xl py-4 transition-colors hover:bg-ivory-100"
                  >
                    <div className="relative h-24 w-20 shrink-0 overflow-hidden rounded-xl bg-ivory-100">
                      <Image
                        src={coverImage(product).src}
                        alt=""
                        fill
                        sizes="80px"
                        className="object-cover"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[0.65rem] uppercase tracking-widest text-ink-soft">
                        {product.subCategory}
                      </p>
                      <h3 className="mt-1 font-display text-lg leading-snug text-forest-900 group-hover:underline">
                        {lang === "bn" && product.nameBn ? (
                          <>
                            <span lang="bn" className="font-bengali">
                              {product.nameBn}
                            </span>
                            <span className="block text-xs font-normal text-ink-soft">{product.name}</span>
                          </>
                        ) : (
                          <>
                            {product.name}
                            {product.nameBn ? (
                              <span lang="bn" className="font-bengali block text-xs font-normal text-ink-soft">
                                {product.nameBn}
                              </span>
                            ) : null}
                          </>
                        )}
                      </h3>
                      <p className="mt-2 text-sm font-medium text-ink">
                        {formatBdt(product.price)}
                        {!product.inStock && (
                          <span className="ml-2 text-xs font-normal text-ink-soft">
                            {t("header.soldOut")}
                          </span>
                        )}
                      </p>
                    </div>
                    <IconArrowRight className="h-4 w-4 shrink-0 text-ink-soft" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
        {!catalogLoading && !catalogEmpty && (!searching || matches.length > 0) && (
          <div className="sticky bottom-0 border-t border-line bg-ivory-50 px-5 py-5 sm:px-8">
            <Link
              href={shopSearchHref(query)}
              onClick={() => {
                if (searching) remember(query);
                close();
              }}
              className="flex min-h-12 items-center justify-center gap-3 rounded-full bg-forest-800 px-5 py-3 text-sm font-semibold text-ivory-50 hover:bg-forest-700"
            >
              {searching
                ? matches.length === 1
                  ? t("header.viewOneResult")
                  : t("header.viewAllResults").replace("{n}", digits(matches.length))
                : t("header.shopFullCollection")}
              <IconArrowRight className="h-4 w-4" />
            </Link>
          </div>
        )}
      </Drawer>
    </>
  );
}
