"use client";

import Drawer from "@/components/ui/drawer";
import { useLanguage } from "@/components/i18n/language-provider";

/**
 * Single-shop guard dialog (marketplace slice 4, D1): one order = one
 * shop, so adding from a second shop asks before clearing the old bag.
 * The server re-enforces this — the dialog is UX, not the boundary.
 */
export default function ShopConflictDialog({
  fromShop,
  toShop,
  onKeep,
  onStartNew,
}: {
  fromShop: string;
  toShop: string;
  onKeep: () => void;
  onStartNew: () => void;
}) {
  const { t } = useLanguage();
  return (
    <Drawer
      open
      onClose={onKeep}
      label={t("shops.conflictTitle")}
      side="bottom"
      panelClassName="sm:!left-auto sm:!w-[480px] sm:!right-6 sm:!bottom-6"
    >
      <h2 className="font-display text-2xl text-forest-900">
        {t("shops.conflictTitle")}
      </h2>
      <p className="mt-3 text-sm leading-6 text-ink-soft">
        {t("shops.conflictBody")
          .replace("{from}", fromShop)
          .replace("{to}", toShop)}
      </p>
      <div className="mt-6 grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={onKeep}
          className="min-h-12 rounded-full bg-paper px-5 text-sm font-medium ring-1 ring-line hover:bg-ivory-100"
        >
          {t("shops.keepBag")}
        </button>
        <button
          type="button"
          onClick={onStartNew}
          className="min-h-12 rounded-full bg-forest-800 px-5 text-sm font-semibold text-ivory-50 hover:bg-forest-700"
        >
          {t("shops.startNew")}
        </button>
      </div>
    </Drawer>
  );
}
