"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useLanguage } from "@/components/i18n/language-provider";
import { IconClose } from "@/components/ui/icons";
import {
  countVisit,
  isStandalone,
  readInstallMemory,
  readVisits,
  shouldOfferInstall,
  writeInstallMemory,
  writeVisits,
} from "@/lib/install-prompt";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/**
 * The "add PROSANTI to your home screen" card. Appears from the second
 * visit, above the bottom nav, never inside the installed app, and stays
 * away for a month after a dismissal. Android/Chrome opens the real install
 * sheet; iOS Safari gets the two-step instruction instead.
 */
export default function InstallPrompt() {
  const { t } = useLanguage();
  const [native, setNative] = useState<BeforeInstallPromptEvent | null>(null);
  const [mode, setMode] = useState<"native" | "ios" | null>(null);
  const [visitsCounted, setVisitsCounted] = useState(false);

  // Count today's visit once per page lifetime; then decide.
  useEffect(() => {
    const visits = countVisit(readVisits());
    writeVisits(visits);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- storage is browser-only
    setVisitsCounted(true);
  }, []);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setNative(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      writeInstallMemory({ ...readInstallMemory(), installed: true });
      setMode(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  useEffect(() => {
    if (!visitsCounted) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- decision depends on browser state
    setMode(
      shouldOfferInstall({
        memory: readInstallMemory(),
        visits: readVisits(),
        standalone: isStandalone(),
        hasNativePrompt: native !== null,
        ua: navigator.userAgent,
      }),
    );
  }, [visitsCounted, native]);

  if (!mode) return null;

  const dismiss = () => {
    writeInstallMemory({ ...readInstallMemory(), dismissedAt: Date.now() });
    setMode(null);
  };
  const install = async () => {
    if (!native) return;
    try {
      await native.prompt();
      const choice = await native.userChoice;
      if (choice.outcome === "accepted") {
        writeInstallMemory({ ...readInstallMemory(), installed: true });
      } else {
        writeInstallMemory({ ...readInstallMemory(), dismissedAt: Date.now() });
      }
    } catch {
      /* the sheet failed to open — nothing to report */
    }
    setNative(null);
    setMode(null);
  };

  return (
    <div
      role="dialog"
      aria-labelledby="install-prompt-title"
      data-testid="install-prompt"
      data-mode={mode}
      className="fixed inset-x-3 z-[45] rounded-2xl border border-line bg-paper p-4 shadow-[0_18px_40px_-20px_rgba(12,25,19,0.45)] sm:inset-x-auto sm:right-6 sm:w-96"
      style={{ bottom: "calc(4.5rem + env(safe-area-inset-bottom))" }}
    >
      <div className="flex items-start gap-3">
        <Image
          src="/icons/icon-192.png"
          alt=""
          width={44}
          height={44}
          className="h-11 w-11 shrink-0 rounded-xl"
        />
        <div className="min-w-0 flex-1">
          <p id="install-prompt-title" className="font-display text-lg leading-snug text-forest-900">
            {t("install.title")}
          </p>
          <p className="mt-1 text-xs leading-5 text-ink-soft">
            {mode === "ios" ? t("install.iosBody") : t("install.body")}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {mode === "native" ? (
              <button
                type="button"
                onClick={install}
                data-testid="install-accept"
                className="inline-flex min-h-10 items-center rounded-full bg-forest-900 px-4 text-xs font-semibold text-ivory-50 hover:bg-forest-800"
              >
                {t("install.cta")}
              </button>
            ) : null}
            <button
              type="button"
              onClick={dismiss}
              data-testid="install-dismiss"
              className="inline-flex min-h-10 items-center rounded-full px-3 text-xs font-semibold text-ink-soft hover:text-forest-900"
            >
              {t("install.later")}
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label={t("install.close")}
          className="-mr-1 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-soft hover:bg-ivory-100 hover:text-forest-900"
        >
          <IconClose className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
