"use client";

/**
 * Gift mode + referral code at checkout (P0 #6 and #7).
 *
 * Gift mode is deliberately two fields and a wrap choice — not a new flow. A
 * present in Sunamganj is carried by the same rider as any other order; what
 * the shop needs is WHO to hand it to and whether to hide the price. The wrap
 * fee is priced from the shop's settings on the server (`validateGift` +
 * `ps_place_order`), never from what this form says — the numbers here are an
 * estimate of the same rule.
 *
 * The referral field is prefilled from `?ref=` when this device arrived on a
 * friend's link, and it can be cleared. A code is a claim, not a coupon: the
 * server only credits a first order with a code it issued.
 */

import { useEffect, useState } from "react";
import { formatBdt } from "@/lib/format";
import { wrapFeeFor, wrapOptions, type GiftConfig, type WrapId } from "@/lib/gift";
import { clearStoredRef, displayRefCode, storedRef } from "@/lib/referral";
import { useSettings } from "@/lib/use-settings";
import { useLanguage } from "@/components/i18n/language-provider";
import { IconClose, IconGift, IconTag } from "@/components/ui/icons";

export interface GiftFormValue {
  on: boolean;
  wrap: WrapId;
  recipientName: string;
  recipientPhone: string;
  message: string;
}

export const GIFT_OFF: GiftFormValue = {
  on: false,
  wrap: "standard",
  recipientName: "",
  recipientPhone: "",
  message: "",
};

/** What the order payload carries — snake_case, straight into validateGift. */
export const giftPayload = (value: GiftFormValue) => ({
  is_gift: value.on,
  gift_recipient_name: value.recipientName,
  gift_recipient_phone: value.recipientPhone,
  gift_message: value.message,
  gift_wrap: value.on ? value.wrap : "none",
});

export const giftFeeFor = (value: GiftFormValue, cfg: GiftConfig): number =>
  value.on ? wrapFeeFor(value.wrap, cfg) : 0;

export function GiftStep({
  value,
  onChange,
  errors,
}: {
  value: GiftFormValue;
  onChange: (next: GiftFormValue) => void;
  errors?: Record<string, string>;
}) {
  const { t } = useLanguage();
  const { settings } = useSettings();
  const cfg = settings.gift;
  const wraps = wrapOptions(cfg);
  const fee = giftFeeFor(value, cfg);

  if (!cfg.enabled) return null;

  return (
    <section
      aria-labelledby="gift-step-heading"
      data-testid="gift-step"
      className={`rounded-2xl border p-5 transition-colors ${
        value.on ? "border-gold-300 bg-gold-50/50" : "border-line bg-paper"
      }`}
    >
      <button
        type="button"
        onClick={() => onChange({ ...value, on: !value.on })}
        aria-pressed={value.on}
        className="flex w-full items-center gap-3 text-left"
      >
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
            value.on ? "bg-forest-800 text-gold-300" : "bg-ivory-100 text-forest-800"
          }`}
        >
          <IconGift className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-display text-lg text-forest-900">
            {t("gift.title")}
          </span>
          <span className="block text-xs leading-5 text-ink-soft">
            {t("gift.hint")}
          </span>
        </span>
        <span
          className={`h-6 w-11 shrink-0 rounded-full p-0.5 transition-colors ${
            value.on ? "bg-forest-800" : "bg-line"
          }`}
          aria-hidden="true"
        >
          <span
            className={`block h-5 w-5 rounded-full bg-paper transition-transform ${
              value.on ? "translate-x-5" : ""
            }`}
          />
        </span>
      </button>

      {value.on ? (
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-soft">
              {t("gift.wrap")}
            </p>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              {wraps.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => onChange({ ...value, wrap: option.id })}
                  aria-pressed={value.wrap === option.id}
                  className={`rounded-xl p-3 text-left ring-1 transition-colors ${
                    value.wrap === option.id
                      ? "bg-paper ring-forest-500"
                      : "bg-paper/60 ring-line hover:ring-forest-300"
                  }`}
                >
                  <span className="block text-sm font-semibold text-forest-900">
                    {option.label}
                  </span>
                  <span className="block text-[0.68rem] text-ink-soft">
                    {option.labelBn}
                  </span>
                  <span className="mt-1 block text-xs font-medium text-gold-700">
                    {option.feePaisa > 0
                      ? t("gift.fee").replace("{amount}", formatBdt(option.feePaisa))
                      : "—"}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <label className="block">
            <span className="block text-xs font-semibold uppercase tracking-[0.16em] text-ink-soft">
              {t("gift.recipient")}
            </span>
            <input
              value={value.recipientName}
              onChange={(e) =>
                onChange({ ...value, recipientName: e.target.value.slice(0, 60) })
              }
              placeholder="Karim Bhai"
              className="mt-1.5 h-11 w-full rounded-xl bg-paper px-3 text-sm ring-1 ring-line focus:ring-2 focus:ring-forest-500"
            />
            {errors?.recipientName ? (
              <span className="mt-1 block text-xs text-rose-700">
                {errors.recipientName}
              </span>
            ) : null}
          </label>

          <label className="block">
            <span className="block text-xs font-semibold uppercase tracking-[0.16em] text-ink-soft">
              {t("gift.recipientPhone")}
            </span>
            <input
              value={value.recipientPhone}
              onChange={(e) =>
                onChange({ ...value, recipientPhone: e.target.value })
              }
              inputMode="tel"
              placeholder="019XXXXXXXX"
              className="mt-1.5 h-11 w-full rounded-xl bg-paper px-3 text-sm ring-1 ring-line focus:ring-2 focus:ring-forest-500"
            />
            {errors?.recipientPhone ? (
              <span className="mt-1 block text-xs text-rose-700">
                {errors.recipientPhone}
              </span>
            ) : null}
          </label>

          <label className="block sm:col-span-2">
            <span className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.16em] text-ink-soft">
              <span>{t("gift.message")}</span>
              <span>
                {t("gift.messageLeft").replace(
                  "{n}",
                  String(Math.max(0, cfg.maxMessageChars - value.message.length)),
                )}
              </span>
            </span>
            <textarea
              value={value.message}
              onChange={(e) =>
                onChange({ ...value, message: e.target.value.slice(0, cfg.maxMessageChars) })
              }
              rows={3}
              className="mt-1.5 w-full rounded-xl bg-paper px-3 py-2.5 text-sm ring-1 ring-line focus:ring-2 focus:ring-forest-500"
            />
          </label>

          <p className="rounded-xl bg-paper px-3 py-2 text-xs leading-6 text-ink-soft sm:col-span-2">
            {t("gift.preview")}
            <span className="mt-1 block text-forest-900">
              {value.recipientName
                ? `For ${value.recipientName}`
                : "For —"}
              {value.message ? ` · “${value.message}”` : ""}
            </span>
            {fee > 0 ? (
              <span className="mt-1 block font-medium text-gold-700">
                {t("gift.fee").replace("{amount}", formatBdt(fee))} ·{" "}
                {t("gift.riderNote")}
              </span>
            ) : null}
          </p>
        </div>
      ) : null}
    </section>
  );
}

/**
 * One optional field. Prefilled once from `?ref=` (the capture component stores
 * it), and clearing here also clears the stored value — a shopper who removes
 * a code must not be re-filled on the next visit.
 */
export function ReferralField({
  value,
  onChange,
  error,
}: {
  value: string;
  onChange: (next: string) => void;
  error?: string;
}) {
  const { t } = useLanguage();
  const { settings } = useSettings();
  const cfg = settings.referral;
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (touched || value !== "") return;
    const stored = storedRef();
    // The store keeps the raw 6 characters; the shopper knows the PS- form.
    if (stored) onChange(displayRefCode(stored.code));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- prefill once, on mount
  }, [touched]);

  if (!cfg.enabled) return null;

  return (
    <div data-testid="referral-field">
      <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-ink-soft">
        <IconTag className="h-3.5 w-3.5 text-gold-600" />
        {t("referral.codeLabel")}
      </label>
      <div className="mt-1.5 flex gap-2">
        <input
          value={value}
          onChange={(e) => {
            setTouched(true);
            onChange(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 10));
          }}
          placeholder="PS-XXXXXX"
          className="h-11 min-w-0 flex-1 rounded-xl bg-paper px-3 font-mono text-sm tracking-[0.12em] ring-1 ring-line focus:ring-2 focus:ring-forest-500"
        />
        {value ? (
          <button
            type="button"
            onClick={() => {
              setTouched(true);
              clearStoredRef();
              onChange("");
            }}
            className="flex h-11 w-11 items-center justify-center rounded-xl text-ink-soft ring-1 ring-line hover:text-rose-700"
            aria-label="Clear code — কোড মুছুন"
          >
            <IconClose className="h-4 w-4" />
          </button>
        ) : null}
      </div>
      <p className="mt-1.5 text-xs leading-5 text-ink-soft">
        {value
          ? t("referral.applied").replace("{amount}", formatBdt(cfg.friendRewardPaisa))
          : t("referral.codeHint").replace("{amount}", formatBdt(cfg.friendRewardPaisa))}
        {cfg.minOrderPaisa > 0 ? (
          <> · {t("referral.minOrder").replace("{amount}", formatBdt(cfg.minOrderPaisa))}</>
        ) : null}
      </p>
      {error ? <p className="mt-1 text-xs text-rose-700">{error}</p> : null}
    </div>
  );
}
