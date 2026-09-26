"use client";

/**
 * One-tap "send this to someone" — native share sheet where the browser has
 * one, WhatsApp (contact picker) otherwise. Renders as a real link so it
 * works without JavaScript hydration and can be asserted by href.
 */

import { useState, type ReactNode } from "react";
import { canNativeShare, copyToClipboard, whatsAppShareLink } from "@/lib/share";
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
  const [copied, setCopied] = useState(false);
  return (
    <a
      href={whatsAppShareLink(text, url)}
      target="_blank"
      rel="noreferrer"
      data-testid={testId}
      onClick={(event) => {
        if (!canNativeShare()) return;
        event.preventDefault();
        void navigator.share({ title: "PROSANTI", text, url }).catch(async () => {
          // Sheet dismissed or unavailable mid-flight — leave the link on
          // the clipboard rather than doing nothing.
          if (await copyToClipboard(url)) {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 2500);
          }
        });
      }}
      className={`inline-flex min-h-11 items-center gap-1.5 rounded-full bg-paper px-3 text-xs font-semibold text-forest-800 ring-1 ring-line hover:bg-forest-100 ${className}`}
    >
      {icon}
      {copied ? copiedLabel : label}
    </a>
  );
}
