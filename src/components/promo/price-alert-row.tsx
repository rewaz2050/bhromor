"use client";

/**
 * Price-drop alert on the product page (P0 #5).
 *
 * Two honest layers: the device remembers the price (so "it dropped" can be
 * shown with no account and no email), and — if the shopper leaves a number —
 * the shop can actually reach them. There is no email or SMS sender wired at
 * launch, so the promise is a call or a WhatsApp from the shop, which is what
 * really happens in Sunamganj. Never "we'll email you" when nothing emails.
 */

import { useState } from "react";
import type { Product } from "@/lib/catalog";
import { formatBdt } from "@/lib/format";
import { usePriceAlert } from "@/lib/use-price-watch";
import { useCustomer } from "@/lib/use-customer";
import { IconBell, IconCheck, IconTrendDown } from "@/components/ui/icons";
import { useLanguage } from "@/components/i18n/language-provider";
import { dropLabel } from "@/lib/price-drop";

export default function PriceAlertRow({ product }: { product: Product }) {
  const { t } = useLanguage();
  const { watching, toggle, drop } = usePriceAlert(product);
  const [hasRow, setHasRow] = useState(false);
  const { customer } = useCustomer();
  const [phone, setPhone] = useState(customer?.phone ?? "");
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");

  const unwatch = async () => {
    if (!hasRow) return;
    setHasRow(false);
    try {
      await fetch("/api/price-watch", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: product.id, phone }),
      });
    } catch {
      // the device stopped watching either way
    }
  };

  const send = async () => {
    setState("busy");
    try {
      const res = await fetch("/api/price-watch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: product.id, phone }),
      });
      if (res.ok) setHasRow(true);
      setState(res.ok ? "done" : "error");
    } catch {
      setState("error");
    }
  };

  return (
    <div className="rounded-xl border border-line bg-paper p-4">
      <p className="flex items-center gap-2 text-sm font-semibold text-forest-900">
        <IconTrendDown className="h-4 w-4 text-gold-600" />
        {t("priceDrop.watch")}
      </p>
      {drop ? (
        <p className="mt-2 rounded-lg bg-forest-100 px-3 py-2 text-xs font-medium text-forest-900">
          {dropLabel(drop)} · {t("priceDrop.savedAt").replace("{price}", formatBdt(drop.was))}
        </p>
      ) : (
        <p className="mt-2 text-xs leading-6 text-ink-soft">{t("priceDrop.channel")}</p>
      )}

      <button
        type="button"
        onClick={() => {
          if (watching) void unwatch();
          toggle();
        }}
        aria-pressed={watching}
        className={`mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-sm text-sm font-semibold transition-colors ${
          watching
            ? "bg-forest-800 text-ivory-50 hover:bg-forest-700"
            : "bg-paper text-forest-800 ring-1 ring-line hover:ring-forest-400"
        }`}
      >
        {watching ? <IconCheck className="h-4 w-4" /> : <IconBell className="h-4 w-4" />}
        {watching ? t("priceDrop.watching") : t("priceDrop.watch")}
      </button>

      {watching ? (
        <div className="mt-3">
          <label className="block text-xs text-ink-soft" htmlFor={`watch-phone-${product.id}`}>
            {t("priceDrop.channel")}
          </label>
          <div className="mt-1.5 flex gap-2">
            <input
              id={`watch-phone-${product.id}`}
              type="tel"
              inputMode="tel"
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value);
                if (state !== "idle") setState("idle");
              }}
              placeholder="017XXXXXXXX"
              className="h-11 min-w-0 flex-1 rounded-xl bg-paper px-3 text-sm ring-1 ring-line focus:ring-2 focus:ring-forest-500"
            />
            <button
              type="button"
              onClick={() => void send()}
              disabled={state === "busy" || phone.trim().length < 11}
              className="h-11 shrink-0 rounded-xl bg-forest-800 px-4 text-xs font-semibold text-ivory-50 disabled:opacity-40"
            >
              {state === "busy" ? "…" : t("priceDrop.watch")}
            </button>
          </div>
          {state === "done" ? (
            <p role="status" className="mt-2 text-xs font-medium text-forest-800">
              {t("priceDrop.logged").replace("{name}", product.name)}
            </p>
          ) : null}
          {state === "error" ? (
            <p role="alert" className="mt-2 text-xs text-rose-700">
              {t("priceDrop.failed")}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
