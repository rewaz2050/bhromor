"use client";

import SizeGuide from "./size-guide";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Product } from "@/lib/catalog";
import { formatBdt } from "@/lib/format";
import { MAX_LINE_QTY } from "@/lib/cart";
import { useCart } from "@/components/cart/cart-provider";
import { DELIVERY_ETA, INSTANT_DELIVERY_TITLE } from "@/lib/delivery";
import { Price } from "@/components/ui/primitives";
import {
  IconCheck,
  IconMapPin,
  IconMinus,
  IconPlus,
  IconShield,
  IconTruck,
} from "@/components/ui/icons";
import { useLanguage } from "@/components/i18n/language-provider";

export default function PurchasePanel({ product }: { product: Product }) {
  const { t } = useLanguage();
  const { addItem, openBag } = useCart();
  const router = useRouter();

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

  /** Join only the parts that exist — colourless products used to produce
   *  a label like " · L" with a dangling separator. */
  const variantLabel =
    [color, hasSizes ? size : ""].filter(Boolean).join(" · ") || "Default";

  const feedbackTimer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (feedbackTimer.current !== null)
        window.clearTimeout(feedbackTimer.current);
    },
    [],
  );

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
  const ctaDisabled = !product.inStock || (product.sizes.length > 0 && !size);
  const ctaLabel =
    !product.inStock
      ? t("purchase.soldOut")
      : product.sizes.length > 0 && !size
        ? t("purchase.selectASize")
        : t("purchase.addToBag");

  const handleAdd = () => {
    if (ctaDisabled) return;
    addItem(product.id, variantLabel, qty);
    addedFeedback();
    openBag();
  };

  const handleBuyNow = () => {
    if (ctaDisabled) return;
    addItem(product.id, variantLabel, qty);
    router.push("/checkout");
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

      <div className="mt-6">
        <Price
          value={product.price}
          compareAt={product.compareAtPrice}
          size="lg"
        />
        {product.compareAtPrice && product.compareAtPrice > product.price && (
          <p className="mt-2 text-sm font-medium text-forest-700">
            {t("purchase.save")} {formatBdt(product.compareAtPrice - product.price)}
          </p>
        )}
        <p className="mt-1 text-xs text-ink-soft">
          {t("purchase.priceInclusive")}
        </p>
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
      <div className="mt-6">
        <div className="flex items-center justify-between gap-4">
          <p className="text-[0.72rem] font-semibold uppercase tracking-[0.24em] text-ink-soft">
            {t("purchase.size")}
          </p>
          <SizeGuide product={product} />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {product.sizes.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSize(s)}
              aria-pressed={size === s}
              className={`h-11 min-w-11 rounded-sm px-4 text-sm transition-colors ${
                size === s
                  ? "bg-forest-800 font-semibold text-ivory-50"
                  : "bg-paper text-ink-soft ring-1 ring-line hover:ring-forest-400"
              }`}
            >
              {s}
            </button>
          ))}
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
          className="h-14 flex-1 rounded-sm bg-forest-800 px-8 text-sm font-semibold text-ivory-50 shadow-[0_8px_24px_-14px_rgb(20_41_31_/_70%)] transition-all hover:-translate-y-px hover:bg-forest-700 hover:shadow-[0_12px_28px_-14px_rgb(20_41_31_/_80%)] disabled:translate-y-0 disabled:opacity-40 disabled:shadow-none"
          disabled={ctaDisabled}
        >
          {ctaLabel}
        </button>
        <button
          type="button"
          onClick={handleBuyNow}
          className="h-14 flex-1 rounded-sm bg-gold-500 px-8 text-sm font-semibold text-forest-950 transition-all hover:-translate-y-px hover:bg-gold-400 disabled:translate-y-0 disabled:opacity-40"
          disabled={ctaDisabled}
        >
          {t("purchase.buyNow")}
        </button>
      </div>

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
          text={`Arrives in ${DELIVERY_ETA} in the service area`}
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
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[0.6rem] font-semibold uppercase tracking-[0.2em] text-ink-soft">
              {product.subCategory}
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
            className="h-12 shrink-0 rounded-sm bg-forest-800 px-5 text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-ivory-50 transition-colors hover:bg-forest-700 disabled:opacity-40"
            disabled={ctaDisabled}
          >
            {ctaLabel}
          </button>
        </div>
      </div>
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
