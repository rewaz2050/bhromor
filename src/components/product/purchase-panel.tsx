"use client";

import SizeGuide from "./size-guide";
import SizeFinder, { useSizeSuggestion } from "./size-finder";
import { useFlashPrice } from "@/lib/use-promos";
import { usePriceDropFor, usePriceMemory } from "@/lib/use-price-watch";

import { FlashPrice, FlashTimer } from "@/components/promo/flash-timer";
import { IconBolt, IconTrendDown } from "@/components/ui/icons";
import { getSizeProfile, suggestSize } from "@/lib/size-finder";
import { markPriceSeen } from "@/lib/price-drop";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Product } from "@/lib/catalog";
import { formatBdt } from "@/lib/format";
import { MAX_LINE_QTY } from "@/lib/cart";
import { waLink, productWaMessage } from "@/lib/whatsapp-order";
import { useCart } from "@/components/cart/cart-provider";
import ShopConflictDialog from "@/components/cart/shop-conflict-dialog";
import StylistChat from "@/components/stylist/stylist-chat";
import { useLiveCatalog } from "@/lib/use-live-catalog";
import { useGuardedAdd } from "@/lib/use-guarded-add";
import {
  isShopOrderable,
  productShopId,
  shopById,
} from "@/lib/shop-utils";
import { DELIVERY_ETA, INSTANT_DELIVERY_TITLE } from "@/lib/delivery";
import { Price } from "@/components/ui/primitives";
import {
  IconCheck,
  IconMapPin,
  IconMinus,
  IconPlus,
  IconRuler,
  IconSend,
  IconShield,
  IconTruck,
} from "@/components/ui/icons";
import { useLanguage } from "@/components/i18n/language-provider";

export default function PurchasePanel({ product }: { product: Product }) {
  const { t, lang } = useLanguage();
  const { openBag } = useCart();
  const { products, shops } = useLiveCatalog();
  const { add, conflict, confirmConflict, dismissConflict } = useGuardedAdd();
  const router = useRouter();
  const [pendingBuyNow, setPendingBuyNow] = useState(false);
  /* P1 #16: the stylist chat hands off to these drawers — one at a time,
     never stacked (the chat closes itself before bumping the key). */
  const [stylistSignal, setStylistSignal] = useState(0);
  const [stylistTarget, setStylistTarget] = useState<"finder" | "guide" | null>(null);

  /* P0 surfaces: the live flash price, the shopper's saved body, and the price
     this device last saw. All three are read-only overlays on the catalog — the
     cart and the checkout recompute the money themselves, so a badge here can
     never disagree with what is charged. */
  const flash = useFlashPrice(product);
  const { suggestion } = useSizeSuggestion(product);
  const drop = usePriceDropFor(product);
  usePriceMemory(product);
  const onSale = flash.was !== null;

  const shop = shopById(shops, productShopId(product, shops[0]?.id ?? ""));
  const shopClosed = shop !== undefined && !isShopOrderable(shop);

  const hasSizes =
    product.sizes.length > 1 || !/free|one size/i.test(product.sizes[0] ?? "");
  const [color, setColor] = useState(product.colors[0] ?? "");
  const [size, setSize] = useState(
    product.sizes.length === 1 ? product.sizes[0] : "",
  );
  const [qty, setQty] = useState(1);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [stickyVisible, setStickyVisible] = useState(false);
  const ctaRef = useRef<HTMLDivElement | null>(null);
  /* P1 #10 — a tap on a disabled "Select a size" used to do nothing. Now the
     size row scrolls into view and pulses, and the sticky bar offers the
     sizes itself, so the next step is never a mystery. */
  const sizeRowRef = useRef<HTMLDivElement | null>(null);
  const [sizeNudge, setSizeNudge] = useState(false);
  const nudgeTimer = useRef<number | null>(null);
  /* P1 #11 — the three size helpers live behind ONE "Size help" row. */
  const [sizeHelpOpen, setSizeHelpOpen] = useState(false);

  /** Join only the parts that exist — colourless products used to produce
   *  a label like " · L" with a dangling separator. */
  const variantLabel =
    [color, hasSizes ? size : ""].filter(Boolean).join(" · ") || "Default";

  /** WhatsApp order (P1 #15): a pre-filled chat for this exact pick. The link
   *  only exists when the shop has a real BD mobile — a chat to nowhere is
   *  worse than none. The shop confirms size/stock; COD stays the payment. */
  const waOrderHref = shop
    ? waLink(shop.phone, productWaMessage({ product, variantLabel, qty }, shop, lang))
    : null;

  /**
   * Pre-select the size this body wears when we already know it — after mount,
   * so the server render and the first client render agree (a saved body is
   * localStorage, and hydration must not disagree about what is selected).
   */
  const sizeTouched = useRef(false);
  useEffect(() => {
    if (product.sizes.length <= 1) return;
    const saved = getSizeProfile();
    if (!saved) return;
    setSize((current) => {
      if (current !== "" || sizeTouched.current) return current;
      return suggestSize(product, saved).recommended ?? "";
    });
  }, [product]);

  const feedbackTimer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (feedbackTimer.current !== null)
        window.clearTimeout(feedbackTimer.current);
      if (nudgeTimer.current !== null) window.clearTimeout(nudgeTimer.current);
    },
    [],
  );

  const needsSize = product.sizes.length > 0 && !size;

  /** Bring the size row into view and pulse it (P1 #10). */
  const nudgeSize = () => {
    const row = sizeRowRef.current;
    if (row) {
      row.scrollIntoView({ behavior: "smooth", block: "center" });
      const first = row.querySelector<HTMLButtonElement>("button[aria-pressed]");
      first?.focus({ preventScroll: true });
    }
    setSizeNudge(true);
    if (nudgeTimer.current !== null) window.clearTimeout(nudgeTimer.current);
    nudgeTimer.current = window.setTimeout(() => setSizeNudge(false), 1400);
  };

  /**
   * On phones the add-to-bag controls scroll out of view quickly. A compact
   * bar appears once they do, so the next step is always one tap away
   * (desktop keeps the main panel in view, so the bar is hidden there).
   */
  useEffect(() => {
    const node = ctaRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([entry]) => setStickyVisible(!entry.isIntersecting),
      { rootMargin: "0px 0px -96px 0px", threshold: 0 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const addedFeedback = () => {
    setFeedback(`${t("purchase.addedToCart")} ${formatBdt(product.price * qty)}`);
    if (feedbackTimer.current !== null)
      window.clearTimeout(feedbackTimer.current);
    feedbackTimer.current = window.setTimeout(() => setFeedback(null), 2600);
  };

  /** One definition for the gate and the label so the inline CTA, the
   *  sticky bar and the disabled state can never disagree. */
  const ctaDisabled =
    shopClosed || !product.inStock || (product.sizes.length > 0 && !size);
  /** Truly blocked (closed shop / sold out) — a missing size is NOT a hard
   *  stop any more: the tap teaches instead of ignoring (P1 #10). */
  const hardStop = shopClosed || !product.inStock;
  const ctaLabel = shopClosed
    ? t("shops.closed")
    : !product.inStock
      ? t("purchase.soldOut")
      : product.sizes.length > 0 && !size
        ? t("purchase.selectASize")
        : t("purchase.addToBag");

  const handleAdd = () => {
    if (needsSize && !shopClosed && product.inStock) return nudgeSize();
    if (ctaDisabled) return;
    setPendingBuyNow(false);
    if (add(product, variantLabel, qty)) {
      addedFeedback();
      openBag();
    }
  };

  const handleBuyNow = () => {
    if (needsSize && !shopClosed && product.inStock) return nudgeSize();
    if (ctaDisabled) return;
    setPendingBuyNow(true);
    if (add(product, variantLabel, qty)) {
      router.push("/checkout");
    }
  };

  const resolveConflict = (confirmed: boolean) => {
    const done = confirmed ? confirmConflict() : null;
    if (!confirmed) dismissConflict();
    if (done) {
      if (pendingBuyNow) router.push("/checkout");
      else {
        addedFeedback();
        openBag();
      }
    }
    setPendingBuyNow(false);
  };

  return (
    <div className="purchase-panel">
      <p className="text-[0.72rem] font-medium uppercase tracking-[0.24em] text-ink-soft">
        {product.category} · {product.subCategory}
      </p>
      <h1 className="font-display mt-2 text-3xl font-medium leading-tight tracking-tight text-forest-900 sm:text-4xl">
        {product.name}
        {product.nameBn && (
          <span className="font-bengali mt-1 block text-base font-normal text-ink-soft">
            {product.nameBn}
          </span>
        )}
      </h1>

      {shop && (
        <div className="mt-3 text-sm">
          <p className="text-ink-soft">
            {t("shops.soldBy")}{" "}
            <Link
              href={`/shops/${shop.slug}`}
              className="font-medium text-forest-700 underline-offset-2 hover:underline"
            >
              {shop.name}
            </Link>
            {!isShopOrderable(shop) && (
              <span className="ml-2 rounded-full bg-ivory-200 px-2.5 py-0.5 text-xs font-semibold text-ink-soft">
                {t("shops.closed")}
              </span>
            )}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-ink-soft">
            <span>{t("shops.prepIn").replace("{min}", String(shop.prepMinutes))}</span>
            {/* P2 #3: the shop's real rating — approved reviews only. Zero
                reviews means no stars, never a seed. */}
            {shop.ratingCount > 0 && (
              <span aria-label={`Rated ${shop.ratingAvg.toFixed(1)} out of 5 from ${shop.ratingCount} reviews`}>
                ★ {shop.ratingAvg.toFixed(1)} ({shop.ratingCount})
              </span>
            )}
          </p>
        </div>
      )}
      {shopClosed && (
        <p className="mt-3 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
          <span className="font-semibold">{t("shops.shopClosed")}</span> —{" "}
          {t("shops.shopClosedHint")}
        </p>
      )}

      <div className="mt-6">
        {onSale ? (
          <FlashPrice price={flash.price} was={flash.was!} pct={flash.pct} size="lg" />
        ) : (
          <Price value={product.price} compareAt={product.compareAtPrice} size="lg" />
        )}
        {onSale ? (
          <p className="mt-1 text-xs text-ink-soft">
            {t("promo.was").replace("{price}", formatBdt(product.price))}
            {product.compareAtPrice && product.compareAtPrice > product.price ? (
              <> · {t("purchase.save")} {formatBdt(product.compareAtPrice - flash.price)}</>
            ) : null}
          </p>
        ) : null}
        {onSale ? (
          <p className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-gold-700">
            <IconBolt className="h-3.5 w-3.5" /> {t("promo.checkoutNote")}
            {flash.state.endsAtMs ? (
              <>
                {" · "}
                <FlashTimer endsAtMs={flash.state.endsAtMs} />
              </>
            ) : null}
          </p>
        ) : product.compareAtPrice && product.compareAtPrice > product.price ? (
          <p className="mt-2 text-sm font-medium text-forest-700">
            {t("purchase.save")} {formatBdt(product.compareAtPrice - product.price)}
          </p>
        ) : null}
        <p className="mt-1 text-xs text-ink-soft">{t("purchase.priceInclusive")}</p>
        {drop ? (
          <p className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-forest-100 px-3 py-1.5 text-xs font-medium text-forest-900">
            <IconTrendDown className="h-3.5 w-3.5 text-forest-700" />
            {t("priceDrop.dropped").replace("{amount}", formatBdt(drop.down))}
            <span className="font-normal text-ink-soft">
              · {t("priceDrop.savedAt").replace("{price}", formatBdt(drop.was))}
            </span>
            <button
              type="button"
              onClick={() => markPriceSeen(product.id, product.price)}
              className="rounded-full bg-forest-800 px-2.5 py-0.5 text-[0.65rem] font-semibold text-ivory-50"
            >
              {t("priceDrop.noted")}
            </button>
          </p>
        ) : null}
      </div>

      <p className="mt-6 max-w-lg leading-7 text-ink-soft">
        {product.shortDescription}
      </p>

      {/* Stock note */}
      <div className="mt-5 flex items-center gap-2 text-sm">
        {product.inStock ? (
          <>
            <span className="h-2 w-2 rounded-sm bg-forest-500" />
            <span className="text-forest-800">{t("purchase.inStock")}</span>
            {product.lowStock && (
              <span className="text-ink-soft">{t("purchase.lowStock")}</span>
            )}
          </>
        ) : (
          <>
            <span className="h-2 w-2 rounded-sm bg-gold-500" />
            <span className="text-gold-700">{t("purchase.soldOutCheckBack")}</span>
          </>
        )}
      </div>

      {/* Colour */}
      {product.colors.length > 0 && (
        <div className="mt-7">
          <p className="text-[0.72rem] font-semibold uppercase tracking-[0.24em] text-ink-soft">
            {t("purchase.colour")}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {product.colors.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                aria-pressed={color === c}
                className={`rounded-sm px-4 py-2 text-sm transition-colors ${
                  color === c
                    ? "bg-forest-800 font-medium text-ivory-50"
                    : "bg-paper text-ink-soft ring-1 ring-line hover:ring-forest-400"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Size */}
      <div className="mt-6" ref={sizeRowRef} id="purchase-size" data-testid="size-row">
        <div className="flex items-center justify-between gap-4">
          <p className="text-[0.72rem] font-semibold uppercase tracking-[0.24em] text-ink-soft">
            {t("purchase.size")}
            {needsSize ? (
              <span className="ml-2 normal-case tracking-normal text-forest-800">
                · {t("purchase.selectASize")}
              </span>
            ) : null}
          </p>
          {product.sizes.length > 0 ? (
            <button
              type="button"
              onClick={() => setSizeHelpOpen((v) => !v)}
              aria-expanded={sizeHelpOpen}
              aria-controls="purchase-size-help"
              data-testid="size-help-toggle"
              className="inline-flex min-h-11 items-center gap-1.5 text-xs font-medium text-forest-800 underline underline-offset-4"
            >
              <IconRuler className="h-3.5 w-3.5" />
              {t("purchase.sizeHelp")}
            </button>
          ) : null}
        </div>
        <div
          className={`mt-3 flex flex-wrap gap-2 rounded-md transition-shadow ${
            sizeNudge ? "size-nudge ring-2 ring-gold-400 ring-offset-4 ring-offset-ivory-50" : ""
          }`}
          role="group"
          aria-label={t("purchase.size")}
        >
          {product.sizes.map((s) => {
            const verdict = suggestion.scores.find((x) => x.size === s);
            return (
              <button
                key={s}
                type="button"
                onClick={() => {
                  sizeTouched.current = true;
                  setSize(s);
                }}
                aria-pressed={size === s}
                data-size-fit={verdict?.verdict ?? "unknown"}
                className={`relative h-11 min-w-11 rounded-sm px-4 text-sm transition-colors ${
                  size === s
                    ? "bg-forest-800 font-semibold text-ivory-50"
                    : "bg-paper text-ink-soft ring-1 ring-line hover:ring-forest-400"
                }`}
              >
                {s}
                {verdict && verdict.verdict !== "skip" ? (
                  <span
                    aria-hidden="true"
                    className={`absolute -top-1.5 right-0 h-2 w-2 rounded-full ${
                      verdict.verdict === "best"
                        ? "bg-gold-500"
                        : verdict.verdict === "snug"
                          ? "bg-amber-400"
                          : "bg-sky-400"
                    }`}
                  />
                ) : null}
              </button>
            );
          })}
        </div>
        {suggestion.recommended ? (
          <p className="mt-2 flex flex-wrap items-center gap-2 text-xs font-medium text-forest-800">
            <span>
              {t("sizeFinder.recommended").replace("{size}", suggestion.recommended)} ·{" "}
              {t("sizeFinder.match").replace(
                "{confidence}",
                String(suggestion.confidence),
              )}
            </span>
            {suggestion.recommended !== size ? (
              <button
                type="button"
                onClick={() => {
                  sizeTouched.current = true;
                  setSize(suggestion.recommended!);
                }}
                className="rounded-full bg-forest-800 px-3 py-1 text-[0.68rem] font-semibold text-ivory-50"
              >
                {t("sizeFinder.useIt")}
              </button>
            ) : null}
          </p>
        ) : suggestion.closest ? (
          <p className="mt-2 text-xs text-ink-soft">
            {t("sizeFinder.closest").replace("{size}", suggestion.closest)}
          </p>
        ) : null}
        {/* P1 #11 — one sheet for all three helpers. The helpers themselves
            keep their own buttons and drawers (and the stylist handoff), they
            are simply not three competing links on the first paint. */}
        <div
          id="purchase-size-help"
          hidden={!sizeHelpOpen}
          className="mt-3 rounded-md bg-ivory-100/70 p-3 ring-1 ring-line"
        >
          <p className="text-xs leading-5 text-ink-soft">{t("purchase.sizeHelpHint")}</p>
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1">
            <SizeFinder
              product={product}
              onPick={(picked) => {
                sizeTouched.current = true;
                setSize(picked);
              }}
              autoOpenKey={stylistTarget === "finder" ? stylistSignal : 0}
            />
            <SizeGuide
              product={product}
              autoOpenKey={stylistTarget === "guide" ? stylistSignal : 0}
            />
            <StylistChat
              product={product}
              catalog={products}
              shop={shop ?? null}
              onUseSize={(picked) => {
                sizeTouched.current = true;
                setSize(picked);
              }}
              onOpenSizeFinder={() => {
                setSizeHelpOpen(true);
                setStylistTarget("finder");
                setStylistSignal((k) => k + 1);
              }}
              onOpenSizeGuide={() => {
                setSizeHelpOpen(true);
                setStylistTarget("guide");
                setStylistSignal((k) => k + 1);
              }}
            />
          </div>
        </div>
      </div>

      {/* Quantity + CTAs */}
      <div
        ref={ctaRef}
        className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center"
      >
        <div className="qty-stepper qty-stepper--tall h-14 justify-between px-1 sm:w-36">
          <button
            type="button"
            onClick={() => setQty((n) => Math.max(1, n - 1))}
            disabled={qty <= 1}
            aria-label={t("product.decreaseQuantity")}
          >
            <IconMinus className="h-4 w-4" />
          </button>
          <span className="font-semibold text-ink" aria-live="polite">
            {qty}
          </span>
          <button
            type="button"
            onClick={() => setQty((n) => Math.min(MAX_LINE_QTY, n + 1))}
            disabled={qty >= MAX_LINE_QTY}
            aria-label={t("product.increaseQuantity")}
          >
            <IconPlus className="h-4 w-4" />
          </button>
        </div>

        <button
          type="button"
          onClick={handleAdd}
          aria-disabled={ctaDisabled || undefined}
          aria-describedby={needsSize ? "purchase-size" : undefined}
          className={`h-14 flex-1 rounded-sm bg-forest-800 px-8 text-sm font-semibold text-ivory-50 shadow-[0_8px_24px_-14px_rgb(20_41_31_/_70%)] transition-all hover:-translate-y-px hover:bg-forest-700 hover:shadow-[0_12px_28px_-14px_rgb(20_41_31_/_80%)] disabled:translate-y-0 disabled:opacity-40 disabled:shadow-none ${
            needsSize && !hardStop ? "opacity-70" : ""
          }`}
          disabled={hardStop}
        >
          {ctaLabel}
        </button>
        <button
          type="button"
          onClick={handleBuyNow}
          aria-disabled={ctaDisabled || undefined}
          className={`h-14 flex-1 rounded-sm bg-gold-500 px-8 text-sm font-semibold text-forest-950 transition-all hover:-translate-y-px hover:bg-gold-400 disabled:translate-y-0 disabled:opacity-40 ${
            needsSize && !hardStop ? "opacity-70" : ""
          }`}
          disabled={hardStop}
        >
          {t("purchase.buyNow")}
        </button>
      </div>

      {/* WhatsApp order — pre-filled chat, shop confirms, COD unchanged */}
      {waOrderHref ? (
        <div className="mt-3">
          <a
            href={waOrderHref}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="whatsapp-order"
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-sm bg-paper text-sm font-semibold text-forest-800 ring-1 ring-line transition-colors hover:text-forest-950 hover:ring-forest-400"
          >
            <IconSend className="h-4 w-4" /> {t("purchase.whatsAppOrder")}
          </a>
          <p className="mt-1.5 text-center text-xs text-ink-soft">
            {t("purchase.whatsAppHint")}
          </p>
        </div>
      ) : null}

      {feedback && (
        <p
          role="status"
          aria-live="polite"
          className="mt-4 inline-flex items-center gap-2 rounded-sm bg-forest-100 px-4 py-2 text-sm font-medium text-forest-900"
        >
          <IconCheck className="h-4 w-4" /> {feedback}
        </p>
      )}

      {/* Delivery trust card */}
      <div className="mt-8 grid gap-3 sm:grid-cols-3">
        <TrustPill
          icon={IconTruck}
          title={INSTANT_DELIVERY_TITLE}
          text={`${
            lang === "bn"
              ? `সুনামগঞ্জ সদরে ${DELIVERY_ETA}-এ পৌঁছায়`
              : `Arrives in ${DELIVERY_ETA} inside Sunamganj Sadar`
          } · ${t("purchase.courierText")}`}
        />
        <TrustPill
          icon={IconMapPin}
          title={t("purchase.zoneBasedCharge")}
          text={t("purchase.zoneChargeText")}
        />
        <TrustPill
          icon={IconShield}
          title={t("purchase.codAvailable")}
          text={t("purchase.codText")}
        />
      </div>

      {/* Compact buy bar for phones — appears once the main CTA scrolls away */}
      <div
        className="sticky-buy-bar border-t border-line bg-paper/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-paper/90"
        data-visible={stickyVisible}
        inert={!stickyVisible}
      >
        <div className="mx-auto max-w-3xl">
          {needsSize && !hardStop ? (
            <div
              className="mb-2 flex items-center gap-2 overflow-x-auto pb-0.5"
              role="group"
              aria-label={t("purchase.selectASize")}
              data-testid="sticky-size-pills"
            >
              <span className="shrink-0 text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-ink-soft">
                {t("purchase.size")}
              </span>
              {product.sizes.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    sizeTouched.current = true;
                    setSize(s);
                  }}
                  className="h-9 shrink-0 rounded-sm bg-paper px-3 text-xs text-ink ring-1 ring-line"
                >
                  {s}
                </button>
              ))}
            </div>
          ) : null}
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[0.6rem] font-semibold uppercase tracking-[0.2em] text-ink-soft">
                {product.subCategory}
                {size && hasSizes ? ` · ${size}` : ""}
              </p>
              <p className="truncate font-display text-base leading-tight text-forest-900">
                {product.name}
              </p>
            </div>
            <p className="shrink-0 text-sm font-semibold text-ink">
              {formatBdt(product.price)}
            </p>
            <button
              type="button"
              onClick={handleAdd}
              aria-disabled={ctaDisabled || undefined}
              className={`h-12 shrink-0 rounded-sm bg-forest-800 px-5 text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-ivory-50 transition-colors hover:bg-forest-700 disabled:opacity-40 ${
                needsSize && !hardStop ? "opacity-70" : ""
              }`}
              disabled={hardStop}
            >
              {ctaLabel}
            </button>
          </div>
        </div>
      </div>

      {conflict && (
        <ShopConflictDialog
          fromShop={conflict.fromShopName}
          toShop={conflict.toShopName}
          onKeep={() => resolveConflict(false)}
          onStartNew={() => resolveConflict(true)}
        />
      )}
    </div>
  );
}

function TrustPill({
  icon: Icon,
  title,
  text,
}: {
  icon: (p: { className?: string }) => React.ReactNode;
  title: string;
  text: string;
}) {
  return (
    <div className="assurance-pill rounded-md bg-paper p-4 ring-1 ring-line">
      <Icon className="h-5 w-5 text-forest-700" />
      <p className="mt-2.5 text-sm font-semibold text-ink">{title}</p>
      <p className="mt-1 text-xs leading-5 text-ink-soft">{text}</p>
    </div>
  );
}
