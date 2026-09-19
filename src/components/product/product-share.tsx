"use client";

import { useState } from "react";
import type { Product } from "@/lib/catalog";
import { formatBdt } from "@/lib/format";
import { showToast } from "@/lib/toast";
import { useLanguage } from "@/components/i18n/language-provider";
import {
  IconCheck,
  IconCopy,
  IconExternal,
  IconSend,
} from "@/components/ui/icons";
import { siteBaseUrl } from "@/lib/site-url";

/**
 * Share this piece (Batch N).
 *
 * In Sunamganj a product travels through WhatsApp groups long before it
 * travels through search: a wife sends the panjabi to her husband, a cousin
 * asks "এইটা কেমন?" in the family group. So the product page offers the three
 * ways that actually get used, in that order:
 *
 *   1. the OS share sheet (Web Share API) — WhatsApp, Messenger, anything;
 *   2. a WhatsApp share link that needs no phone number (works on desktop too);
 *   3. copy link, for anywhere else — confirmed with a toast, not an alert.
 *
 * The message carries the name and the live price so the recipient sees what
 * the sender saw, and the URL is absolute so it opens when pasted.
 */
export default function ProductShare({ product }: { product: Product }) {
  const { t } = useLanguage();
  const [copied, setCopied] = useState(false);

  const link =
    typeof window !== "undefined"
      ? `${window.location.origin}/product/${product.slug}`
      : `${siteBaseUrl()}/product/${product.slug}`;
  const message = `${product.name} — ${formatBdt(product.price)}\n${link}`;

  const canShare =
    typeof navigator !== "undefined" && typeof navigator.share === "function";

  const shareNative = async () => {
    try {
      await navigator.share({
        title: product.name,
        text: `${product.name} — ${formatBdt(product.price)}`,
        url: link,
      });
    } catch {
      /* The shopper backed out of the sheet, or the browser refused — the
         other two buttons are still right there. Silence is correct here. */
    }
  };

  const copy = async () => {
    const ok = await copyToClipboard(message);
    setCopied(ok);
    showToast({
      message: ok ? t("share.copied") : t("share.failed"),
      tone: ok ? "success" : "warn",
    });
    if (ok) window.setTimeout(() => setCopied(false), 2400);
  };

  return (
    <div
      data-testid="product-share"
      className="mt-6 flex flex-wrap items-center gap-2 border-t border-line pt-5"
    >
      <span className="mr-1 text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-ink-soft">
        {t("share.label")}
      </span>

      {canShare ? (
        <button
          type="button"
          onClick={() => void shareNative()}
          className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line px-4 text-sm font-medium text-forest-900 transition-colors hover:border-forest-700 hover:bg-forest-50"
        >
          <IconExternal className="h-3.5 w-3.5" />
          {t("share.share")}
        </button>
      ) : null}

      <a
        href={`https://wa.me/?text=${encodeURIComponent(message)}`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line px-4 text-sm font-medium text-forest-900 transition-colors hover:border-forest-700 hover:bg-forest-50"
      >
        <IconSend className="h-3.5 w-3.5" />
        {t("share.whatsApp")}
      </a>

      <button
        type="button"
        onClick={() => void copy()}
        className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line px-4 text-sm font-medium text-forest-900 transition-colors hover:border-forest-700 hover:bg-forest-50"
      >
        {copied ? (
          <IconCheck className="h-3.5 w-3.5 text-forest-700" />
        ) : (
          <IconCopy className="h-3.5 w-3.5" />
        )}
        {copied ? t("share.linkCopied") : t("share.copyLink")}
      </button>
    </div>
  );
}

/**
 * Clipboard with the fallback the old browsers in this market still need
 * (navigator.clipboard is https-only and missing on some Android WebViews).
 */
async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the legacy path
  }
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  } catch {
    return false;
  }
}
