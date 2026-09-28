"use client";

/**
 * B1 (2026-09-28) — "নতুন পণ্যের খবর দিন" on the shop storefront.
 *
 * The shop-level sibling of the restock alert: a shopper who liked the whole
 * shop (not one piece) leaves a number, and every product the shop publishes
 * afterwards reaches that phone. Two honest promises, both enforced by the
 * pipeline behind the card:
 *
 *   • push only goes to a phone that has PROSANTI notifications on — there is
 *     no SMS sender in this stack, so the card never says "we will text you";
 *   • the followers push could not reach stay on the shop's list in /vendor
 *     as a real number to call, so nobody is silently dropped.
 *
 * The `marketingOk` tick is the shopper's own choice and is stored with the
 * row (`shop_follows.marketing_ok`): a follow that declined news is a number
 * the shop may see, not one it may message.
 *
 * Plain props (no useParams) so it can be rendered and tested without a
 * router — the shop page passes the values it already resolved.
 */

import { useState } from "react";
import { useCustomer } from "@/lib/use-customer";
import { useLanguage } from "@/components/i18n/language-provider";
import { IconBell, IconCheck } from "@/components/ui/icons";

export default function FollowShopCard({
  shopId,
  shopName,
}: {
  shopId: string;
  shopName: string;
}) {
  const { t } = useLanguage();
  const { customer } = useCustomer();
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState(customer?.phone ?? "");
  const [marketing, setMarketing] = useState(true);
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");

  const save = async (next: boolean) => {
    setState("busy");
    try {
      const res = await fetch("/api/shop-follow", {
        method: next ? "POST" : "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shopId, phone, marketingOk: marketing }),
      });
      setState(res.ok ? "done" : "error");
      if (res.ok) {
        // The card stays open: the confirmation line names the shop, and the
        // same button now un-follows — never a dead end.
        setOpen(true);
      }
    } catch {
      setState("error");
    }
  };

  const done = state === "done";

  return (
    <section
      className="mt-6 rounded-2xl border border-line bg-paper p-4 sm:p-5"
      data-testid="follow-shop"
      aria-label={t("shops.followTitle")}
    >
      <p className="flex items-center gap-2 text-sm font-semibold text-forest-900">
        <IconBell className="h-4 w-4 text-gold-600" />
        {t("shops.followTitle").replace("{shop}", shopName)}
      </p>
      <p className="mt-2 text-xs leading-6 text-ink-soft">{t("shops.followChannel")}</p>

      {!open && !done && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-sm bg-forest-800 text-sm font-semibold text-ivory-50 transition-colors hover:bg-forest-700"
        >
          <IconBell className="h-4 w-4" />
          {t("shops.followCta")}
        </button>
      )}

      {(open || done) && (
        <div className="mt-3">
          <label
            className="block text-xs text-ink-soft"
            htmlFor={`follow-phone-${shopId}`}
          >
            {t("shops.followPhoneLabel")}
          </label>
          <div className="mt-1.5 flex gap-2">
            <input
              id={`follow-phone-${shopId}`}
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
              onClick={() => void save(!done)}
              disabled={state === "busy" || phone.trim().length < 11}
              data-testid={done ? "follow-stop" : "follow-submit"}
              className={`h-11 shrink-0 rounded-xl px-4 text-xs font-semibold disabled:opacity-40 ${
                done
                  ? "bg-paper text-forest-800 ring-1 ring-line hover:ring-forest-400"
                  : "bg-forest-800 text-ivory-50"
              }`}
            >
              {state === "busy"
                ? "…"
                : done
                  ? t("shops.followStop")
                  : t("shops.followSubmit")}
            </button>
          </div>

          <label className="mt-3 flex items-start gap-2 text-xs text-ink-soft">
            <input
              type="checkbox"
              checked={marketing}
              onChange={(e) => {
                setMarketing(e.target.checked);
                if (state !== "idle") setState("idle");
              }}
              data-testid="follow-marketing"
              className="mt-0.5 h-4 w-4 accent-forest-800"
            />
            <span>{t("shops.followMarketing")}</span>
          </label>

          {done && (
            <p
              role="status"
              className="mt-2 flex items-center gap-1.5 text-xs font-medium text-forest-800"
            >
              <IconCheck className="h-3.5 w-3.5" />
              {t("shops.followLogged").replace("{shop}", shopName)}
            </p>
          )}
          {state === "error" && (
            <p role="alert" className="mt-2 text-xs font-medium text-red-700">
              {t("shops.followFailed")}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
