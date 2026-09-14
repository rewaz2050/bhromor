"use client";

/**
 * Stylist chat (P1 #16) — the one place a shopper asks "which size?",
 * "what goes with this?" and "is it actually in stock?".
 *
 * Honesty rules (same posture as the rest of the storefront):
 *   • Every answer is computed live — the size answer from the customer's
 *     own saved body numbers + the sizes this item actually sells, the
 *     pairing answer from in-stock catalog rows, the stock answer from the
 *     product's real fields. No canned replies, no invented persona.
 *   • The only person in this chat is a real person: the shop team on
 *     WhatsApp, reached with the product and the asked topic pre-filled —
 *     and only when the shop has a plausible BD mobile (P1 #15 rule).
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Product, Shop } from "@/lib/catalog";
import { formatBdt } from "@/lib/format";
import { completeTheLook } from "@/lib/merchandising";
import { useSizeSuggestion } from "@/components/product/size-finder";
import { waLink } from "@/lib/whatsapp-order";
import {
  STYLIST_TOPICS,
  stylistWaMessage,
  type StylistTopic,
} from "@/lib/stylist";
import Drawer from "@/components/ui/drawer";
import { IconChat, IconClose, IconRuler } from "@/components/ui/icons";
import { useLanguage } from "@/components/i18n/language-provider";

const QUESTION: Record<StylistTopic, "stylist.qSize" | "stylist.qPairing" | "stylist.qStock" | "stylist.qHuman"> = {
  size: "stylist.qSize",
  pairing: "stylist.qPairing",
  stock: "stylist.qStock",
  human: "stylist.qHuman",
};

export default function StylistChat({
  product,
  catalog,
  shop,
  onUseSize,
  onOpenSizeFinder,
  onOpenSizeGuide,
}: {
  product: Product;
  /** Live catalog for the pairing answer (discoverable, in-stock rows). */
  catalog: Product[];
  /** The owning shop — the handoff goes to its real mobile, if it has one. */
  shop?: Shop | null;
  /** Select the suggested size in the purchase panel. */
  onUseSize?: (size: string) => void;
  /** Open the size finder drawer (closes this one first — no stacked dialogs). */
  onOpenSizeFinder?: () => void;
  /** Open the size & fit guide drawer. */
  onOpenSizeGuide?: () => void;
}) {
  const { t, lang } = useLanguage();
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<StylistTopic[]>([]);
  const listRef = useRef<HTMLDivElement | null>(null);
  const { suggestion } = useSizeSuggestion(product);

  const ask = (topic: StylistTopic) => {
    if (turns.includes(topic) && topic !== "human") return;
    // The human handoff may be re-asked (the link is stateless); the catalog
    // answers stay one-per-topic so the chat reads like a Q&A list.
    setTurns((prev) =>
      topic === "human" || !prev.includes(topic) ? [...prev, topic] : prev,
    );
  };

  const leaveTo = (openOther?: () => void) => {
    setOpen(false);
    openOther?.();
  };

  useEffect(() => {
    if (!open) return;
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns, open]);

  const pairing = completeTheLook(product, catalog, 4);
  const waHref = shop
    ? waLink(shop.phone, stylistWaMessage(product, shop, lang, lastNonHuman()))
    : null;

  function lastNonHuman(): StylistTopic | null {
    for (let i = turns.length - 1; i >= 0; i--) {
      if (turns[i] !== "human") return turns[i];
    }
    return null;
  }

  const renderAnswer = (topic: StylistTopic) => {
    switch (topic) {
      case "size": {
        const rec = suggestion.recommended;
        const closest = suggestion.closest;
        return (
          <div className="space-y-3">
            <p>
              {rec
                ? t("stylist.aSizeRec")
                    .replace("{size}", rec)
                    .replace("{conf}", String(suggestion.confidence))
                : closest
                  ? t("stylist.aSizeClosest").replace("{size}", closest)
                  : t("stylist.aSizeNoProfile")}
            </p>
            <div className="flex flex-wrap gap-2">
              {rec && (
                <button
                  type="button"
                  onClick={() => {
                    onUseSize?.(rec);
                    setOpen(false);
                  }}
                  className="rounded-full bg-forest-800 px-4 py-2 text-xs font-semibold text-ivory-50 transition-colors hover:bg-forest-700"
                >
                  {t("stylist.aSizeUseIt")} · {rec}
                </button>
              )}
              {!rec && (
                <button
                  type="button"
                  onClick={() => leaveTo(onOpenSizeFinder)}
                  className="inline-flex items-center gap-1.5 rounded-full bg-ivory-100 px-4 py-2 text-xs font-semibold text-ink ring-1 ring-line transition-colors hover:bg-ivory-200"
                >
                  <IconRuler className="h-3.5 w-3.5" />
                  {t("stylist.aSizeOpenFinder")}
                </button>
              )}
              <button
                type="button"
                onClick={() => leaveTo(onOpenSizeGuide)}
                className="rounded-full px-4 py-2 text-xs font-medium text-forest-800 underline underline-offset-4"
              >
                {t("stylist.aSizeGuide")}
              </button>
            </div>
          </div>
        );
      }
      case "pairing":
        return pairing.length > 0 ? (
          <ul className="space-y-2">
            {pairing.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/product/${p.slug}`}
                  className="flex items-center justify-between gap-3 rounded-xl bg-paper px-4 py-3 ring-1 ring-line transition-colors hover:ring-forest-400"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-ink">
                      {p.name}
                    </span>
                    <span className="block text-xs text-ink-soft">
                      {p.subCategory}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm font-semibold text-forest-900">
                    {formatBdt(p.price)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p>{t("stylist.aPairingNone")}</p>
        );
      case "stock":
        return (
          <div className="space-y-2">
            <p>
              {product.inStock
                ? product.lowStock
                  ? t("stylist.aStockLow")
                  : t("stylist.aStockIn")
                : t("stylist.aStockOut")}
            </p>
            {product.colors.length > 0 && (
              <p>
                {t("stylist.aStockColors")}{" "}
                <span className="font-medium text-forest-900">
                  {product.colors.join(" · ")}
                </span>
              </p>
            )}
          </div>
        );
      case "human":
        return (
          <div className="space-y-3">
            <p>{t("stylist.aHuman")}</p>
            {waHref ? (
              <a
                href={waHref}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-full bg-forest-800 px-4 py-2 text-xs font-semibold text-ivory-50 transition-colors hover:bg-forest-700"
              >
                <IconChat className="h-3.5 w-3.5" />
                {t("stylist.aHumanCta")}
              </a>
            ) : (
              <Link
                href="/contact"
                className="inline-flex items-center gap-1.5 rounded-full bg-ivory-100 px-4 py-2 text-xs font-semibold text-ink ring-1 ring-line transition-colors hover:bg-ivory-200"
              >
                {t("stylist.aHumanNoPhone")}
              </Link>
            )}
          </div>
        );
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="inline-flex min-h-11 items-center gap-1.5 text-xs font-medium text-forest-800 underline underline-offset-4"
      >
        <IconChat className="h-3.5 w-3.5" />
        {t("stylist.cta")}
      </button>

      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        label={t("stylist.title")}
        side="right"
        panelClassName="!w-full !max-w-lg p-6 sm:p-8"
      >
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-3xl text-forest-900">
              {t("stylist.title")}
            </h2>
            <p className="mt-2 text-sm leading-7 text-ink-soft">
              {t("stylist.subtitle")}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label={t("header.closeMenu")}
            className="flex h-11 w-11 shrink-0 items-center justify-center"
          >
            <IconClose />
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          {STYLIST_TOPICS.map((topic) => {
            const asked = turns.includes(topic);
            const disabled = asked && topic !== "human";
            return (
              <button
                key={topic}
                type="button"
                onClick={() => ask(topic)}
                disabled={disabled}
                aria-pressed={asked}
                className={`min-h-11 rounded-full px-4 text-xs font-medium transition-colors ${
                  disabled
                    ? "cursor-default bg-ivory-100 text-ink-soft/50 ring-1 ring-line"
                    : asked
                      ? "bg-forest-100 text-forest-900 ring-1 ring-forest-300"
                      : "bg-paper text-ink ring-1 ring-line hover:ring-forest-400"
                }`}
              >
                {t(QUESTION[topic])}
              </button>
            );
          })}
        </div>

        <div
          ref={listRef}
          className="mt-5 max-h-[50vh] space-y-4 overflow-y-auto pb-2"
        >
          {turns.length === 0 ? (
            <p className="rounded-xl border border-dashed border-line bg-ivory-100/60 px-4 py-6 text-center text-xs leading-6 text-ink-soft">
              {product.name} — {t("stylist.subtitle")}
            </p>
          ) : (
            turns.map((topic, i) => (
              <div key={`${topic}-${i}`} className="space-y-2">
                <div className="flex justify-end">
                  <p className="max-w-[85%] rounded-2xl rounded-br-sm bg-forest-800 px-4 py-2.5 text-sm text-ivory-50">
                    {t(QUESTION[topic])}
                  </p>
                </div>
                <div className="flex justify-start">
                  <div className="max-w-[92%] rounded-2xl rounded-bl-sm bg-paper px-4 py-3 text-sm leading-7 text-ink-soft ring-1 ring-line">
                    {renderAnswer(topic)}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </Drawer>
    </>
  );
}
