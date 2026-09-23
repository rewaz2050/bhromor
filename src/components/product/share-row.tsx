"use client";

import { useEffect, useState } from "react";
import type { Product } from "@/lib/catalog";
import { absoluteUrl } from "@/lib/site-url";
import {
  canNativeShare,
  copyToClipboard,
  facebookShareLink,
  shareText,
  shareUrl,
  whatsAppShareLink,
} from "@/lib/share";
import { useLanguage } from "@/components/i18n/language-provider";
import { useTransientValue } from "@/lib/use-transient-value";
import { IconCopy, IconSend, IconShare } from "@/components/ui/icons";

/**
 * "Share this piece" — WhatsApp, Facebook, copy link, and the device share
 * sheet where the browser offers one. Renders on the product page under the
 * buy buttons; the links are plain URLs so they work in any WebView.
 */
export default function ShareRow({
  product,
  className = "",
}: {
  product: Product;
  className?: string;
}) {
  const { t, lang } = useLanguage();
  const [pageUrl, setPageUrl] = useState(() => absoluteUrl(`/product/${product.slug}`));
  const [native, setNative] = useState(false);
  const [notice, setNotice] = useTransientValue("");

  useEffect(() => {
    // The canonical URL is known on the server; the real one (custom domain,
    // preview host) only in the browser. Swap after mount, hydration-safe.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- browser-only values read post-mount
    setPageUrl(`${window.location.origin}/product/${product.slug}`);
    setNative(canNativeShare());
  }, [product.slug]);

  const text = shareText(product, lang);
  const copyLink = async () => {
    const ok = await copyToClipboard(shareUrl(pageUrl, "copy"));
    setNotice(ok ? t("purchase.linkCopied") : t("purchase.copyFailed"));
  };
  const nativeShare = async () => {
    try {
      await navigator.share({ title: product.name, text, url: shareUrl(pageUrl, "native") });
    } catch {
      // dismissed sheet or unsupported payload — nothing to report
    }
  };

  const btn =
    "inline-flex min-h-10 items-center gap-1.5 rounded-full bg-paper px-3.5 text-xs font-semibold text-forest-800 ring-1 ring-line transition-colors hover:text-forest-950 hover:ring-forest-400";

  return (
    <div className={`share-row ${className}`} data-testid="share-row">
      <p className="text-[0.62rem] font-semibold uppercase tracking-[0.2em] text-ink-soft">
        {t("purchase.shareTitle")}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {native ? (
          <button type="button" onClick={nativeShare} className={btn} data-testid="share-native">
            <IconShare className="h-3.5 w-3.5" /> {t("purchase.share")}
          </button>
        ) : null}
        <a
          href={whatsAppShareLink(text, shareUrl(pageUrl, "whatsapp"))}
          target="_blank"
          rel="noopener noreferrer"
          className={btn}
          data-testid="share-whatsapp"
        >
          <IconSend className="h-3.5 w-3.5" /> {t("purchase.shareWhatsApp")}
        </a>
        <a
          href={facebookShareLink(shareUrl(pageUrl, "facebook"))}
          target="_blank"
          rel="noopener noreferrer"
          className={btn}
          data-testid="share-facebook"
        >
          {t("purchase.shareFacebook")}
        </a>
        <button type="button" onClick={copyLink} className={btn} data-testid="share-copy">
          <IconCopy className="h-3.5 w-3.5" /> {t("purchase.copyLink")}
        </button>
      </div>
      <p role="status" aria-live="polite" className={notice ? "mt-2 text-xs text-forest-800" : "sr-only"}>
        {notice}
      </p>
    </div>
  );
}
