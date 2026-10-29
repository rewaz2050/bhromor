"use client";

/**
 * One-tap "send this to someone" — native share sheet where the browser has
 * one, WhatsApp (contact picker) otherwise. Renders as a real link so it
 * works without JavaScript hydration and can be asserted by href.
 */

import { useId, useState, type ReactNode } from "react";
import { useLanguage } from "@/components/i18n/language-provider";
import { useTransientValue } from "@/lib/use-transient-value";
import { isShareCancellation, canNativeShare, copyToClipboard, whatsAppShareLink } from "@/lib/share";
import { IconSend } from "@/components/ui/icons";

export default function ShareLink({
  text,
  url,
  label,
  copiedLabel,
  testId,
  className = "",
  icon = <IconSend className="h-3.5 w-3.5" />,
}: {
  text: string;
  url: string;
  label: string;
  copiedLabel: string;
  testId?: string;
  className?: string;
  icon?: ReactNode;
}) {
  const { t } = useLanguage();
  const [copied, setCopied] = useTransientValue(false, 2500);
  const [notice, setNotice] = useTransientValue("", 6000);
  const [nativeFailed, setNativeFailed] = useState(false);
  const feedbackId = useId();
  return (
    <>
      <a
        href={whatsAppShareLink(text, url)}
        target="_blank"
        rel="noopener noreferrer"
        aria-describedby={notice ? feedbackId : undefined}
        data-testid={testId}
        onClick={async (event) => {
          if (nativeFailed || !canNativeShare()) return;
          event.preventDefault();
          try {
            await navigator.share({ title: "PROSANTI", text, url });
          } catch (error) {
            if (isShareCancellation(error)) return;
            setNativeFailed(true);
            if (await copyToClipboard(url)) {
              setCopied(true);
            } else {
              setNotice(t("purchase.shareFallback"));
            }
          }
        }}
        className={`inline-flex min-h-11 items-center gap-1.5 rounded-full bg-paper px-3 text-xs font-semibold text-forest-800 ring-1 ring-line hover:bg-forest-100 ${className}`}
      >
        {icon}
        <span aria-live="polite">{copied ? copiedLabel : label}</span>
      </a>
      <span id={feedbackId} aria-live="polite" className={notice ? "max-w-sm text-xs leading-5 text-ink-soft" : "sr-only"}>
        {notice}
      </span>
    </>
  );
}
