"use client";

/**
 * Back-in-stock alert on the product page (P2 #2) — the sibling of
 * PriceAlertRow for the other reason a shopper hesitates: this was the
 * exact piece, and it sold out.
 *
 * One honest promise: when the shop flips the piece back in stock, staff
 * get a one-line inbox note with this shopper's number and call — the same
 * way PROSANTI already confirms orders. There is no SMS/email sender wired,
 * so we never say "we'll text you".
 *
 * Renders only while the product is actually out of stock — a "notify me"
 * on something you can buy right now is a lie, so there is no such state.
 */

import { useState } from "react";
import type { Product } from "@/lib/catalog";
import { useCustomer } from "@/lib/use-customer";
import { IconBell, IconCheck } from "@/components/ui/icons";
import { useLanguage } from "@/components/i18n/language-provider";

export default function RestockAlertRow({ product }: { product: Product }) {
  const { t } = useLanguage();
  const { customer } = useCustomer();
  const [phone, setPhone] = useState(customer?.phone ?? "");
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [waiting, setWaiting] = useState(false);

  if (product.inStock) return null;

  const send = async () => {
    setState("busy");
    try {
      const res = await fetch("/api/stock-watch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: product.id, phone }),
      });
      if (res.ok) setWaiting(true);
      setState(res.ok ? "done" : "error");
    } catch {
      setState("error");
    }
  };

  const stop = async () => {
    setState("idle");
    setWaiting(false);
    try {
      await fetch("/api/stock-watch", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: product.id, phone }),
      });
    } catch {
      // the form went back to the not-waiting state either way
    }
  };

  return (
    <div className="rounded-xl border border-line bg-paper p-4">
      <p className="flex items-center gap-2 text-sm font-semibold text-forest-900">
        <IconBell className="h-4 w-4 text-gold-600" />
        {t("restock.title")} — {product.name}
      </p>
      <p className="mt-2 text-xs leading-6 text-ink-soft">{t("restock.channel")}</p>

      <button
        type="button"
        onClick={() => setWaiting((w) => !w)}
        aria-pressed={waiting}
        className={`mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-sm text-sm font-semibold transition-colors ${
          waiting
            ? "bg-forest-800 text-ivory-50 hover:bg-forest-700"
            : "bg-paper text-forest-800 ring-1 ring-line hover:ring-forest-400"
        }`}
      >
        {waiting ? <IconCheck className="h-4 w-4" /> : <IconBell className="h-4 w-4" />}
        {waiting ? t("restock.watching") : t("restock.watch")}
      </button>

      {waiting ? (
        <div className="mt-3">
          <label
            className="block text-xs text-ink-soft"
            htmlFor={`restock-phone-${product.id}`}
          >
            {t("restock.phoneLabel")}
          </label>
          <div className="mt-1.5 flex gap-2">
            <input
              id={`restock-phone-${product.id}`}
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
              {state === "busy" ? "…" : t("restock.watch")}
            </button>
          </div>
          {state === "done" ? (
            <p role="status" className="mt-2 text-xs font-medium text-forest-800">
              {t("restock.logged").replace("{name}", product.name)}
              <button
                type="button"
                onClick={() => void stop()}
                className="ml-2 text-ink-soft underline underline-offset-2"
              >
                {t("restock.stop")}
              </button>
            </p>
          ) : null}
          {state === "error" ? (
            <p role="alert" className="mt-2 text-xs text-rose-700">
              {t("restock.failed")}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
