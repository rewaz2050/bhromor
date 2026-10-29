"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import CatalogRecovery from "@/components/shop/catalog-recovery";
import { bnDigits } from "@/lib/arrival";
import InfoRail from "@/components/info/info-rail";
import { Suspense, useEffect, useRef, useState } from "react";
import { useWishlist } from "@/lib/use-wishlist";
import { useLiveCatalog } from "@/lib/use-live-catalog";
import ProductCard, { GRID_CARD_SIZES } from "@/components/product/product-card";
import ProductRail from "@/components/home/product-rail";
import ShareLink from "@/components/ui/share-link";
import { IconHeart, IconTrash } from "@/components/ui/icons";
import { useLanguage } from "@/components/i18n/language-provider";
import PriceWatchStrip from "@/components/promo/watch-strip";
import { goesWith, inStockFirst } from "@/lib/home-shelves";
import { readStockMemory, rememberStock, returnedToStock } from "@/lib/stock-memory";
import type { Product } from "@/lib/catalog";

export const WISHLIST_RAIL_MIN = 2;
/** A shared link carries at most this many ids — enough for a gift hint. */
export const SHARED_IDS_MAX = 24;

/** `/wishlist?ids=a,b,c` → the ids someone shared, or [] on the owner's own page. */
export const parseSharedIds = (search: string): string[] => {
  const raw = new URLSearchParams(search).get("ids") ?? "";
  return Array.from(
    new Set(
      raw
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0 && s.length <= 64),
    ),
  ).slice(0, SHARED_IDS_MAX);
};

export const wishlistShareHref = (origin: string, ids: readonly string[]): string =>
  `${origin}/wishlist?ids=${encodeURIComponent(ids.slice(0, SHARED_IDS_MAX).join(","))}`;

function WishlistLoading() {
  const { t } = useLanguage();
  return <p role="status" className="rounded-2xl border border-line bg-paper p-8 text-sm leading-6 text-ink-soft">{t("wishlist.loadingList")}</p>;
}

function WishlistRoute() {
  const params = useSearchParams();
  const search = params?.toString() ?? "";
  // Navigation between shared links and the personal list must not retain
  // the previous route's success/error state or back-in-stock comparison.
  return <WishlistContent key={search} search={search} />;
}

/** §29 wishlist — grid of saved products with an elegant empty state (§96). */
export default function WishlistView() {
  return <Suspense fallback={<WishlistLoading />}><WishlistRoute /></Suspense>;
}

function WishlistContent({ search }: { search: string }) {
  const { t, lang } = useLanguage();
  const digits = (n: number) => lang === "bn" ? bnDigits(String(n)) : String(n);
  const { ids, clear, ready, busy, error, synced, retry, toggle } = useWishlist();
  const { products, loading: catalogLoading, live: catalogLive } = useLiveCatalog();
  const sharedIds = parseSharedIds(search);
  const shared = sharedIds.length > 0;
  const source = shared ? sharedIds : ids;
  // UX plan §8 — sold-out pieces sit at the end; the order is otherwise the
  // order things were saved in.
  const saved = inStockFirst(products.filter((p) => source.includes(p.id)));
  const savedShared = saved.length > 0 && saved.every((product) => ids.includes(product.id));
  const [savingShared, setSavingShared] = useState(false);
  const savingLock = useRef(false);
  const [actionError, setActionError] = useState("");
  const saveShared = async () => {
    if (!ready || busy || savingLock.current || savedShared) return;
    savingLock.current = true;
    setSavingShared(true);
    setActionError("");
    try {
      // Account mutations have a single-write lock. Parallel toggles return
      // false for later items; never report them as successfully saved.
      for (const product of saved.filter((product) => !ids.includes(product.id))) {
        if (!(await toggle(product.id))) {
          setActionError(t("wishlist.saveIncomplete"));
          return;
        }
      }
    } catch {
      setActionError(t("wishlist.saveIncomplete"));
    } finally {
      savingLock.current = false;
      setSavingShared(false);
    }
  };
  const clearAll = async () => {
    if (!window.confirm(t("wishlist.confirmClear"))) return;
    setActionError("");
    try {
      if (!(await clear())) setActionError(t("wishlist.clearFailed"));
    } catch { setActionError(t("wishlist.clearFailed")); }
  };
  /* UX plan §8 (R11) — "back in stock": what this device last saw sold out
     and finds on the shelf now. Decided once per visit (after the list is
     real), then today's state is remembered for the next visit. */
  const [returnedIds, setReturnedIds] = useState<string[] | null>(null);
  const savedKey = saved.map((p) => `${p.id}:${p.inStock ? 1 : 0}`).join(",");
  useEffect(() => {
    if (!ready || shared || returnedIds !== null || products.length === 0) return;
    const list = saved;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage comparison must happen post-mount
    setReturnedIds(returnedToStock(list, readStockMemory()).map((p) => p.id));
    rememberStock(list);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- savedKey stands for `saved`
  }, [ready, shared, returnedIds, products.length, savedKey]);
  const returned = returnedIds ?? [];

  if (!ready && !shared)
    return (
      <div
        className="border border-line bg-ivory-100 p-8"
        role={error ? "alert" : "status"}
      >
        <p className="text-sm text-ink-soft">
          {error ? t("wishlist.syncFailed") : t("wishlist.loading")}
        </p>
        {error && (
          <button
            disabled={busy}
            onClick={() => void retry?.()}
            className="editorial-button mt-4 bg-forest-800 text-white"
          >
            {t("wishlist.retrySync")}
          </button>
        )}
      </div>
    );
  if (source.length > 0 && saved.length === 0) {
    if (catalogLoading) return <p role="status" className="rounded-2xl border border-line bg-paper p-8 text-sm leading-6 text-ink-soft">{t("wishlist.loadingProducts")}</p>;
    if (products.length === 0 && !catalogLive) return <CatalogRecovery description={t(shared ? "wishlist.sharedCatalogUnavailable" : "wishlist.catalogUnavailable")} />;
    return (
      <section className="rounded-2xl border border-line bg-paper p-6 text-center sm:p-8">
        <h2 className="font-display text-2xl text-forest-900">{t("wishlist.itemsUnavailable")}</h2>
        <p role="status" className="mx-auto mt-3 max-w-md text-sm leading-6 text-ink-soft">{t(shared ? "wishlist.sharedItemsUnavailable" : "wishlist.savedItemsUnavailable")}</p>
        <Link href="/shop" className="mt-5 inline-flex min-h-11 items-center rounded-full bg-forest-800 px-5 text-sm font-semibold text-ivory-50">{t("wishlist.exploreCollection")}</Link>
      </section>
    );
  }
  if (saved.length === 0) {
    return (
      <>
      <div className="flex flex-col items-center rounded-3xl border border-dashed border-line bg-ivory-100/50 px-8 py-24 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-paper text-gold-500 ring-1 ring-line">
          <IconHeart className="h-7 w-7" />
        </span>
        <h2 className="font-display mt-6 text-2xl font-medium text-forest-900">
          {t("wishlist.wishlistWaiting")}
        </h2>
        <p className="mt-2 max-w-sm text-sm leading-6 text-ink-soft">
          {t("wishlist.tapHeartHint")}
          {synced ? ` ${t("wishlist.savedToAccount")}` : ` ${t("wishlist.guestHint")}`}
        </p>
        <Link
          href="/shop"
          className="mt-7 inline-flex h-12 items-center gap-2 rounded-full bg-forest-800 px-7 text-sm font-semibold text-ivory-50 transition-colors hover:bg-forest-700"
        >
          {t("wishlist.exploreCollection")}
        </Link>
        <Link href="/account" className="editorial-text-link mt-4">
          {synced ? t("wishlist.manageAccount") : t("wishlist.signInToSync")}
        </Link>
      </div>
      {/* UX plan §1.4 (R8) — an empty wishlist still shows product: the
          best sellers, so the first heart is one scroll away. */}
      <InfoRail id="wishlist-empty-rail" />
      </>
    );
  }

  const suggestions: Product[] = goesWith(saved, products);
  const hasSoldOut = saved.some((p) => !p.inStock);
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  return (
    <div className="space-y-6">
      {shared ? (
        /* UX plan §8 — a list someone sent: read it, buy from it, or keep it. */
        <div
          data-testid="wishlist-shared"
          className="rounded-3xl bg-paper px-6 py-6 ring-1 ring-line sm:px-8"
        >
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-ink-soft">
            {t("wishlist.pageEyebrow")}
          </p>
          <h2 className="font-display mt-2 text-2xl text-forest-900">{t("wishlist.sharedTitle")}</h2>
          <p className="mt-2 max-w-md text-sm leading-6 text-ink-soft">{t("wishlist.sharedSub")}</p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={!ready || busy || savingShared || savedShared}
              data-testid="save-shared"
              onClick={() => void saveShared()}
              aria-busy={savingShared}
              className="inline-flex min-h-11 items-center gap-2 rounded-full bg-forest-800 px-5 text-sm font-semibold text-ivory-50 transition-colors hover:bg-forest-700 disabled:opacity-60"
            >
              <IconHeart className="h-4 w-4" />
              {savedShared ? t("wishlist.savedShared") : savingShared ? t("wishlist.savingShared") : t("wishlist.saveShared")}
            </button>
            <Link href="/wishlist" className="editorial-text-link">
              {t("wishlist.viewMine")}
            </Link>
          </div>
        </div>
      ) : (
        <p className="text-sm text-ink-soft">
          {synced ? t("wishlist.savedToAccount") : t("wishlist.savedOnDevice")}{" "}
          <Link href="/account" className="underline underline-offset-4">
            {synced ? t("wishlist.manageAccountShort") : t("wishlist.signInShort")}
          </Link>
        </p>
      )}
      {shared && !ready && (
        <div role={error ? "alert" : "status"} className="rounded-2xl border border-line bg-paper p-4 text-sm leading-6 text-ink-soft">
          <p>{t(error ? "wishlist.syncFailed" : "wishlist.loading")}</p>
          {error && <button type="button" disabled={busy} onClick={() => void retry?.()} className="mt-3 inline-flex min-h-11 items-center rounded-full bg-forest-800 px-5 font-semibold text-ivory-50">{t("wishlist.retrySync")}</button>}
        </div>
      )}
      {actionError && <p role="alert" className="rounded-2xl border border-line bg-paper p-4 text-sm leading-6 text-ink">{actionError}</p>}
      {source.length > saved.length && <p role="status" className="text-sm leading-6 text-ink-soft">{t("wishlist.missingItems").replace("{count}", digits(source.length - saved.length))}</p>}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-soft">
          {digits(saved.length)} {saved.length === 1 ? t("wishlist.savedProduct") : t("wishlist.savedProducts")}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {/* UX plan §8 — "ei gulo dekho": the list as a link, a gift hint. */}
          <ShareLink
            text={t("wishlist.shareListText")}
            url={wishlistShareHref(origin, saved.map((p) => p.id))}
            label={t("wishlist.shareList")}
            copiedLabel={t("wishlist.shareListCopied")}
            testId="wishlist-share"
          />
          {!shared ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void clearAll()}
              className="inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-xs font-semibold text-ink-soft ring-1 ring-line transition-colors hover:text-rose-700 hover:ring-rose-300"
            >
              <IconTrash className="h-3.5 w-3.5" /> {t("wishlist.clearAll")}
            </button>
          ) : null}
        </div>
      </div>
      {!shared ? <PriceWatchStrip products={saved} /> : null}
      {returned.length > 0 ? (
        <p
          role="status"
          className="rounded-2xl bg-forest-50 px-4 py-3 text-sm font-medium text-forest-900 ring-1 ring-forest-200"
          data-testid="wishlist-back-in-stock"
        >
          {returned.length === 1
            ? t("wishlist.backInStockOne").replace(
                "{name}",
                saved.find((p) => p.id === returned[0])?.name ?? "",
              )
            : t("wishlist.backInStockMany").replace("{n}", String(returned.length))}
        </p>
      ) : null}
      {hasSoldOut ? (
        <p className="text-xs leading-5 text-ink-soft" data-testid="wishlist-soldout-note">
          {t("wishlist.soldOutLast")}
        </p>
      ) : null}
      <div className="grid grid-cols-2 gap-x-5 gap-y-10 md:grid-cols-3 xl:grid-cols-4" data-list="wishlist">
        {saved.map((p) => (
          <ProductCard key={p.id} product={p} backInStock={returned.includes(p.id)} sizes={GRID_CARD_SIZES} />
        ))}
      </div>
      {/* UX plan §8 — a suggestion rail under the list: complements first,
          then the same shelves, in stock only, never a saved piece. */}
      {suggestions.length >= WISHLIST_RAIL_MIN ? (
        <div className="-mx-4 sm:-mx-6 lg:-mx-8">
          <ProductRail
            id="wishlist-rail"
            testId="wishlist-rail"
            eyebrow={t("wishlist.railEyebrow")}
            title={t("wishlist.railTitle")}
            sub={t("wishlist.railSub")}
            href="/shop"
            seeAllLabel={t("wishlist.railSeeAll")}
            products={suggestions}
            tone="paper"
          />
        </div>
      ) : null}
    </div>
  );
}
