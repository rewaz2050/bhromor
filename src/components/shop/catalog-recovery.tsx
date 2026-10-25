"use client";

import Link from "next/link";
import { useLanguage } from "@/components/i18n/language-provider";
import { useLiveCatalog } from "@/lib/use-live-catalog";

/** A retry without a reload; the registry keeps all concurrent readers in sync. */
export default function CatalogRecovery({ savedBag = false, onNavigate, description }: { savedBag?: boolean; onNavigate?: () => void; description?: string }) {
  const { t } = useLanguage();
  const { loading, retry } = useLiveCatalog();
  return (
    <section aria-busy={loading} className="rounded-2xl border border-line bg-paper p-6 text-center sm:p-8">
      <h2 className="font-display text-2xl text-forest-900">{t(loading ? "header.catalogLoading" : "header.catalogEmpty")}</h2>
      <p role="status" className="mx-auto mt-3 max-w-md text-sm leading-6 text-ink-soft">
        {loading ? t(savedBag ? "header.savedBagLoading" : "header.catalogLoadingHint") : description ?? t(savedBag ? "header.savedBagUnavailable" : "header.catalogEmptyHint")}
      </p>
      <button type="button" disabled={loading} onClick={() => void retry()} className="mt-5 inline-flex min-h-11 items-center justify-center rounded-full bg-forest-800 px-5 text-sm font-semibold text-ivory-50 disabled:opacity-60">
        {t("header.retryCatalog")}
      </button>
      <Link href="/contact" onClick={onNavigate} className="mt-3 flex min-h-11 items-center justify-center text-sm text-forest-800 underline underline-offset-4">{t("track.contactSupport")}</Link>
    </section>
  );
}
