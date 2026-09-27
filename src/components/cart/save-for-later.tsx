"use client";

import Link from "next/link";
import { useCart } from "./cart-provider";
import { useLanguage } from "@/components/i18n/language-provider";
import { IconHeart } from "@/components/ui/icons";
import { useWishlist } from "@/lib/use-wishlist";
import { useTransientValue } from "@/lib/use-transient-value";

/**
 * UX plan §5 (R11) — "পরে কিনব": a bag line is moved to the wishlist instead
 * of being thrown away. Same wishlist every other surface reads (guest
 * store or the signed-in account's), so the piece is still one tap away on
 * /wishlist, with its price-drop / back-in-stock badges.
 */
export function useSaveForLater() {
  const { removeItem } = useCart();
  const { has, toggle } = useWishlist();
  const { t } = useLanguage();
  const [notice, showNotice] = useTransientValue<string>("", 4000);

  const save = async (productId: string, variantLabel: string, productName: string) => {
    const ok = has(productId) ? true : await toggle(productId);
    if (!ok) return false;
    removeItem(productId, variantLabel);
    showNotice(t("bag.savedForLater").replace("{name}", productName));
    return true;
  };

  return { save, notice };
}

export function SaveForLaterButton({
  productId,
  variantLabel,
  productName,
  onSave,
  className = "",
}: {
  productId: string;
  variantLabel: string;
  productName: string;
  onSave: (productId: string, variantLabel: string, productName: string) => Promise<boolean>;
  className?: string;
}) {
  const { t } = useLanguage();
  return (
    <button
      type="button"
      data-testid="save-for-later"
      aria-label={`${t("bag.saveForLater")} — ${productName}`}
      onClick={() => void onSave(productId, variantLabel, productName)}
      className={`inline-flex min-h-11 items-center gap-1.5 px-1 text-xs text-ink-soft underline decoration-line underline-offset-4 transition-colors hover:text-forest-800 ${className}`}
    >
      <IconHeart className="h-3.5 w-3.5" />
      {t("bag.saveForLater")}
    </button>
  );
}

/** The one-line confirmation, with the way back to the piece. */
export function SavedForLaterNotice({
  notice,
  onNavigate,
  className = "",
}: {
  notice: string;
  onNavigate?: () => void;
  className?: string;
}) {
  const { t } = useLanguage();
  if (!notice) return null;
  return (
    <p
      role="status"
      data-testid="saved-for-later-notice"
      className={`flex flex-wrap items-center gap-x-2 rounded-sm bg-gold-100 px-3 py-2 text-xs font-medium text-forest-900 ring-1 ring-gold-200 ${className}`}
    >
      <IconHeart className="h-3.5 w-3.5 text-gold-700" />
      <span>{notice}</span>
      <Link href="/wishlist" onClick={onNavigate} className="font-semibold underline underline-offset-2">
        {t("bag.savedForLaterOpen")}
      </Link>
    </p>
  );
}
