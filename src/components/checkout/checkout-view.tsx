"use client";

import CheckoutAssurance from "./checkout-assurance";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useCart } from "@/components/cart/cart-provider";
import BagShopHeader from "@/components/cart/bag-shop-header";
import { useLiveZones } from "@/lib/use-live-zones";
import { useLiveCatalog } from "@/lib/use-live-catalog";
import { useMyZone } from "@/lib/use-my-zone";
import {
  lineShopIds,
  shopById,
  splitEta,
} from "@/lib/shop-utils";
import { recordCouponUseInStore } from "@/lib/coupons-store";
import { ORDER_PREFIX } from "@/lib/catalog";
import { getDeliveryCode, makePlacedOrder, type Order } from "@/lib/orders";
import { addOrderToStore } from "@/lib/order-store";
import { formatBdt } from "@/lib/format";
import {
  DELIVERY_ETA,
  FREE_DELIVERY_THRESHOLD,
  INSTANT_DELIVERY_TITLE,
  deliveryChargeFor,
  orderTotal,
} from "@/lib/delivery";
import {
  IconArrowRight,
  IconBag,
  IconBox,
  IconCheck,
  IconGift,
  IconMapPin,
  IconShield,
  IconTruck,
} from "@/components/ui/icons";
import { useLanguage } from "@/components/i18n/language-provider";

interface FormState {
  name: string;
  phone: string;
  area: string;
  address: string;
  note: string;
  couponCode: string;
  zoneId: string;
  payment: "cod";
  submitting: boolean;
}

const initialForm: FormState = {
  name: "",
  phone: "",
  area: "",
  address: "",
  note: "",
  couponCode: "",
  zoneId: "",
  payment: "cod",
  submitting: false,
};

export default function CheckoutView() {
  const { t } = useLanguage();
  const { detail, subtotal, clear } = useCart();
  /** Delivery zones are live-served when the backend is up, seeds otherwise. */
  const { activeZones: zoneList } = useLiveZones();
  const { shops } = useLiveCatalog();
  const { zoneId: myZoneId, setZoneId: setMyZoneId } = useMyZone();
  /** The bag's shop (single-shop carts carry exactly one). */
  const bagShop =
    shopById(
      shops,
      lineShopIds(detail, shops[0]?.id ?? "")[0] ?? "",
    ) ?? null;
  const [form, setForm] = useState<FormState>(initialForm);
  const [placed, setPlaced] = useState<{
    orderId: string;
    eta: string;
    charge: number;
    total: number;
    addressSummary: string;
  } | null>(null);

  // Coupon truth lives on the server: the code is validated against the
  // *current* cart via /api/coupons/validate, debounced so shrinking the
  // cart can never leave a stale discount attached to the order.
  const [appliedCode, setAppliedCode] = useState("");
  const [couponCheck, setCouponCheck] = useState<{
    code: string | null;
    discount: number;
    problem: string | null;
  }>({ code: null, discount: 0, problem: null });
  const [couponMsg, setCouponMsg] = useState<{
    ok: boolean;
    text: string;
  } | null>(null);
  const submittingRef = useRef(false);
  const [orderError, setOrderError] = useState<string | null>(null);

  /** Browse-time zone pre-fills checkout; an explicit pick wins after. */
  const myZoneValid =
    myZoneId && zoneList.some((z) => z.id === myZoneId) ? myZoneId : null;
  const chosenZoneId = zoneList.some((z) => z.id === form.zoneId)
    ? form.zoneId
    : (myZoneValid ?? zoneList[0]?.id ?? "");
  const zone = zoneList.find((z) => z.id === chosenZoneId) ?? zoneList[0];

  const cartKey = `${detail.map((l) => `${l.product.id}|${l.variantLabel}|${l.qty}`).join(",")}|${subtotal}`;
  useEffect(() => {
    // Clearing happens at the call sites (apply/remove); the effect only
    // answers for a non-empty code so no sync setState runs here.
    if (!appliedCode) return;
    const items = detail.map((l) => ({ productId: l.product.id, qty: l.qty }));
    const timer = window.setTimeout(() => {
      void (async () => {
        interface ValidateResponse {
          valid?: boolean;
          code?: string;
          discount?: number;
          reason?: string | null;
        }
        let data: ValidateResponse | null = null;
        try {
          const res = await fetch("/api/coupons/validate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ code: appliedCode, items }),
          });
          data = (await res.json().catch(() => null)) as ValidateResponse | null;
          if (res.ok && data?.valid && data.code) {
            setCouponCheck({
              code: data.code,
              discount: Math.max(
                0,
                Math.min(data.discount ?? 0, subtotal),
              ),
              problem: null,
            });
            setCouponMsg({
              ok: true,
              text: `${data.code} applied — ${formatBdt(Math.max(0, Math.min(data.discount ?? 0, subtotal)))} off.`,
            });
            return;
          }
        } catch {
          data = null;
        }
        setCouponCheck({
          code: null,
          discount: 0,
          problem:
            data?.reason ??
            "That code is no longer valid for this order.",
        });
      })();
    }, 350);
    return () => window.clearTimeout(timer);
    // cartKey (not detail) keeps the effect keyed on a stable string.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appliedCode, cartKey]);

  const activeCoupon = useMemo(
    () => (couponCheck.code ? { code: couponCheck.code } : null),
    [couponCheck.code],
  );

  const summary = useMemo(() => {
    // Free delivery now applies here too — the cart promised it and
    // checkout silently charged anyway.
    const charge = deliveryChargeFor(zone?.charge ?? 0, subtotal);
    const discount = activeCoupon ? couponCheck.discount : 0;
    return {
      charge,
      fullCharge: zone?.charge ?? 0,
      freeDelivery: (zone?.charge ?? 0) > 0 && charge === 0,
      discount,
      total: orderTotal(subtotal, charge, discount),
      itemCount: detail.reduce((n, l) => n + l.qty, 0),
    };
  }, [zone, subtotal, detail, activeCoupon, couponCheck.discount]);

  const empty = detail.length === 0;

  if (placed) {
    const deliveryCode = getDeliveryCode(placed.orderId);

    return (
      <div className="mx-auto max-w-2xl px-6 py-16 text-center">
        <span className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-forest-100 text-forest-800">
          <IconCheck className="h-9 w-9 stroke-[2.5]" />
        </span>
        <p className="font-bengali mt-8 text-sm text-ink-soft">
          {t("checkout.orderConfirmedBn")}
        </p>
        <h1 className="font-display mt-2 text-3xl font-medium text-forest-900 sm:text-4xl">
          {t("checkout.orderConfirmed")}
        </h1>
        <p className="mt-4 text-ink-soft">
          অর্ডার নম্বর <strong className="text-ink">{placed.orderId}</strong> — ধন্যবাদ
          {form.name ? `, ${form.name.split(" ")[0]}` : ""}। আপনার ডেলিভারি প্রস্তুত করা হচ্ছে।
        </p>

        {/* 4-digit Security PIN card */}
        <div className="mx-auto mt-6 max-w-sm rounded-2xl bg-gold-50/80 p-5 ring-1 ring-gold-300 shadow-sm text-center">
          <div className="flex items-center justify-center gap-1.5 text-xs font-bold uppercase tracking-wider text-forest-900">
            <IconShield className="h-4 w-4 text-gold-600" />
            আপনার নিরাপদ ডেলিভারি পিন (Security PIN)
          </div>
          <div className="mt-3 flex items-center justify-center gap-2 font-mono text-2xl font-bold text-forest-900">
            {deliveryCode.split("").map((digit, i) => (
              <span
                key={i}
                className="flex h-11 w-10 items-center justify-center rounded-xl bg-paper shadow-sm ring-1 ring-line"
              >
                {digit}
              </span>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-ink-soft">
            পার্সেল ও ক্যাশ লেনদেনের সময় এই ৪-সংখ্যার কোডটি রাইডারকে বলুন।
          </p>
        </div>

        {/* Loyalty Card Boost Notice */}
        <div className="mx-auto mt-4 max-w-sm rounded-2xl bg-forest-50 p-3.5 ring-1 ring-forest-200 text-xs text-forest-900 flex items-center gap-2.5 text-left">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-forest-800 text-gold-300">
            <IconGift className="h-4 w-4" />
          </span>
          <div>
            <strong className="block font-semibold">১০-অর্ডার রিওয়ার্ড প্রগ্রেস</strong>
            <span className="text-ink-soft text-[11px]">
              এই অর্ডার ডেলিভারি রিসিভ করলে আপনার লয়্যালটি কার্ডে +১ স্ট্যাম্প যোগ হবে!
            </span>
          </div>
        </div>

        <div className="mx-auto mt-6 max-w-sm space-y-3 rounded-3xl bg-paper p-6 text-left text-sm ring-1 ring-line">
          <p className="flex items-center gap-3">
            <IconTruck className="h-5 w-5 text-forest-700" />
            আনুমানিক সময়:{" "}
            <strong className="text-ink">{placed.eta}</strong>
          </p>
          <p className="flex items-center gap-3">
            <IconMapPin className="h-5 w-5 text-forest-700" />
            <span className="text-ink-soft">{placed.addressSummary}</span>
          </p>
          <p className="flex items-center justify-between border-t border-line pt-3 font-medium text-ink">
            {t("checkout.totalCod")} — {t("checkout.cashOnDelivery")}
            <span>{formatBdt(placed.total)}</span>
          </p>
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
          <Link
            href="/track"
            className="inline-flex h-12 items-center gap-2 rounded-full bg-forest-800 px-7 text-sm font-semibold text-ivory-50 transition-colors hover:bg-forest-700"
          >
            লাইভ ম্যাপে ট্র্যাক করুন <IconArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="/shop"
            className="inline-flex h-12 items-center rounded-full bg-paper px-7 text-sm font-medium ring-1 ring-line"
          >
            {t("checkout.continueShopping")}
          </Link>
        </div>
      </div>
    );
  }

  if (empty) {
    return (
      <div className="flex flex-col items-center px-6 py-20 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-ivory-100 text-forest-700 ring-1 ring-line">
          <IconBag className="h-7 w-7" />
        </span>
        <h2 className="font-display mt-6 text-2xl font-medium text-forest-900">
          {t("checkout.nothingToCheckout")}
        </h2>
        <p className="mt-2 text-sm text-ink-soft">{t("checkout.addProductFirst")}</p>
        <Link
          href="/shop"
          className="mt-7 inline-flex h-12 items-center gap-2 rounded-full bg-forest-800 px-7 text-sm font-semibold text-ivory-50 transition-colors hover:bg-forest-700"
        >
          {t("checkout.exploreProducts")} <IconArrowRight className="h-4 w-4" />
        </Link>
      </div>
    );
  }

  if (!zone) {
    return (
      <div className="flex flex-col items-center px-6 py-20 text-center">
        <h2 className="font-display text-2xl font-medium text-forest-900">
          Delivery zones are being set up
        </h2>
        <p className="mt-2 max-w-sm text-sm text-ink-soft">
          Please check back shortly — no service area is configured yet.
        </p>
      </div>
    );
  }

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const applyCoupon = () => {
    const code = form.couponCode.trim().toUpperCase();
    if (!code) return;
    // The validation effect above answers with success or a reason.
    setCouponCheck({ code: null, discount: 0, problem: null });
    setCouponMsg({ ok: true, text: "Checking code…" });
    setAppliedCode(code);
  };

  /**
   * Place the order through the backend when it is live, else keep the
   * browser-local demo flow. Live failures NEVER fall back to a local
   * order — a customer must not see “confirmed” for an order the shop
   * will never receive.
   */
  const placeOrder = async () => {
    // Ref guard: two submits inside one tick both passed the state check,
    // which could place the same order twice.
    if (submittingRef.current) return; // idempotent — no double submission (§79)
    submittingRef.current = true;
    update("submitting", true);
    setOrderError(null);

    const fail = (message: string) => {
      submittingRef.current = false;
      update("submitting", false);
      setOrderError(message);
    };

    /** Demo-mode placement: local store only, exactly as before. */
    const placeLocally = () => {
      const stamp = new Date();
      const date = `${stamp.getFullYear()}${String(stamp.getMonth() + 1).padStart(2, "0")}${String(stamp.getDate()).padStart(2, "0")}`;
      const seq = String(Math.floor(1000 + Math.random() * 9000));
      const orderId = `${ORDER_PREFIX}-${date}-${seq}`;
      // Store the order in the demo backend (order-store) so the admin
      // Orders queue and the public Track page can follow it live (§92).
      addOrderToStore(
        makePlacedOrder({
          id: orderId,
          createdAt: stamp.getTime(),
          customer: {
            name: form.name,
            phone: form.phone,
            area: form.area,
            address: form.address,
            note: form.note,
          },
          zone: {
            id: zone.id,
            name: zone.name,
            etaLabel: zone.etaLabel,
            charge: summary.charge,
          },
          items: detail.map((l) => ({
            product: l.product,
            image: l.product.media[0]?.src ?? "",
            variant: l.variantLabel,
            qty: l.qty,
          })),
          coupon: activeCoupon
            ? { code: activeCoupon.code, discount: summary.discount }
            : undefined,
        }),
      );
      if (activeCoupon) recordCouponUseInStore(activeCoupon.code);
      setPlaced({
        orderId,
        eta: zone.etaLabel,
        charge: summary.charge,
        total: summary.total,
        addressSummary: `${form.address || form.area}, ${zone.name}`,
      });
      clear();
    };

    let res: Response;
    try {
      res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          phone: form.phone,
          area: form.area,
          address: form.address,
          note: form.note,
          zoneId: zone.id,
          couponCode: activeCoupon?.code,
          items: detail.map((l) => ({
            productId: l.product.id,
            variantLabel: l.variantLabel,
            qty: l.qty,
          })),
        }),
      });
    } catch {
      fail(
        "Could not reach the shop — check your connection and try again. Your cart is untouched.",
      );
      return;
    }

    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      // Non-JSON error page — fall through to the generic failure below.
    }
    const data = (body ?? {}) as {
      demoMode?: boolean;
      order?: Order;
      error?: string;
      errors?: { message: string }[];
    };

    if (res.ok && data.demoMode) {
      placeLocally();
      return;
    }
    if (res.ok && data.order) {
      // Live order: mirror it into the local store so the Track page keeps
      // working on this device (§92). Coupon usage is incremented by the
      // order RPC itself — never locally in live mode.
      addOrderToStore(data.order);
      setPlaced({
        orderId: data.order.id,
        eta: data.order.etaLabel,
        charge: data.order.deliveryCharge,
        total: data.order.total,
        addressSummary: `${form.address || form.area}, ${data.order.zoneName}`,
      });
      clear();
      return;
    }
    const serverMessage =
      data.errors?.map((e) => e.message).join(" ") || data.error;
    fail(
      serverMessage ||
        "Could not place the order — please try again. Your cart is untouched.",
    );
  };

  // Plain area names — the old `"Kandirpar · Zone A"` strings were stored
  // verbatim as the customer's area on the order.
  const areaOptions = zone.areas;

  return (
    <div className="grid gap-12 lg:grid-cols-[1fr_400px]">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          placeOrder();
        }}
        className="min-w-0"
      >
        {/* Contact */}
        <section>
          <h2 className="font-display text-xl font-medium text-forest-900">
            {t("checkout.deliveryDetails")}
          </h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-ink">
                {t("checkout.fullName")}
              </span>
              <input
                required
                value={form.name}
                onChange={(e) => update("name", e.target.value)}
                placeholder="e.g. Rahat Ahmed"
                className="h-12 w-full rounded-2xl bg-paper px-4 text-sm text-ink ring-1 ring-line placeholder:text-ink-soft/50 focus:ring-2 focus:ring-forest-500"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-ink">
                {t("checkout.phoneNumber")}
              </span>
              <input
                required
                type="tel"
                inputMode="tel"
                pattern="(\+?88)?01[0-9]{9}"
                title="A valid Bangladeshi mobile number, e.g. 017XXXXXXXX or +88017XXXXXXXX"
                value={form.phone}
                onChange={(e) => update("phone", e.target.value)}
                placeholder="017XXXXXXXX"
                className="h-12 w-full rounded-2xl bg-paper px-4 text-sm text-ink ring-1 ring-line placeholder:text-ink-soft/50 focus:ring-2 focus:ring-forest-500"
              />
            </label>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-ink">
                {t("checkout.deliveryArea")}
              </span>
              <select
                required
                value={zone.id}
                onChange={(e) => {
                  update("zoneId", e.target.value);
                  setMyZoneId(e.target.value);
                }}
                className="h-12 w-full rounded-2xl bg-paper px-4 text-sm text-ink ring-1 ring-line focus:ring-2 focus:ring-forest-500"
              >
                {zoneList.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.name} — {formatBdt(z.charge)} · {z.etaLabel}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-ink">
                {t("checkout.areaNeighbourhood")}
              </span>
              <input
                required
                list="prosanti-areas"
                value={form.area}
                onChange={(e) => update("area", e.target.value)}
                placeholder="e.g. Kandirpar"
                className="h-12 w-full rounded-2xl bg-paper px-4 text-sm text-ink ring-1 ring-line placeholder:text-ink-soft/50 focus:ring-2 focus:ring-forest-500"
              />
              <datalist id="prosanti-areas">
                {areaOptions.map((a) => (
                  <option key={a} value={a} />
                ))}
              </datalist>
            </label>
          </div>

          <label className="mt-4 block">
            <span className="mb-1.5 block text-sm font-medium text-ink">
              {t("checkout.fullAddress")}
            </span>
            <textarea
              required
              rows={3}
              value={form.address}
              onChange={(e) => update("address", e.target.value)}
              placeholder="House, road, landmark…"
              className="w-full rounded-2xl bg-paper px-4 py-3 text-sm text-ink ring-1 ring-line placeholder:text-ink-soft/50 focus:ring-2 focus:ring-forest-500"
            />
          </label>

          <label className="mt-4 block">
            <span className="mb-1.5 block text-sm font-medium text-ink">
              {t("checkout.orderNote")}{" "}
              <span className="font-normal text-ink-soft">{t("checkout.optional")}</span>
            </span>
            <input
              value={form.note}
              onChange={(e) => update("note", e.target.value)}
              placeholder="e.g. Call before arriving"
              className="h-12 w-full rounded-2xl bg-paper px-4 text-sm text-ink ring-1 ring-line placeholder:text-ink-soft/50 focus:ring-2 focus:ring-forest-500"
            />
          </label>
        </section>

        {/* Delivery estimate */}
        <section className="mt-10">
          <h2 className="font-display text-xl font-medium text-forest-900">
            {t("checkout.deliveryEstimate")}
          </h2>
          <div className="mt-5 flex items-start gap-4 rounded-2xl bg-forest-900 p-5 text-ivory-100">
            <IconTruck className="mt-0.5 h-6 w-6 shrink-0 text-gold-300" />
            <div className="text-sm leading-6">
              <p className="font-semibold">{zone.name}</p>
              {bagShop && (
                <p className="mt-1 text-ivory-100/70">
                  {t("shops.checkoutEta")}: {bagShop.name} ·{" "}
                  <strong className="text-gold-300">
                    {splitEta(bagShop.prepMinutes, zone.etaLabel)}
                  </strong>
                </p>
              )}
              <p className="mt-1 text-ivory-100/70">
                {INSTANT_DELIVERY_TITLE} — estimated arrival{" "}
                <strong className="text-gold-300">{zone.etaLabel}</strong> from
                confirmation · Delivery charge{" "}
                <strong>
                  {summary.freeDelivery ? "Free" : formatBdt(summary.charge)}
                </strong>
              </p>
            </div>
          </div>
        </section>

        {/* Payment */}
        <section className="mt-10">
          <h2 className="font-display text-xl font-medium text-forest-900">
            {t("checkout.paymentMethod")}
          </h2>
          <div className="mt-5 space-y-3">
            <label
              className={`flex cursor-pointer items-center gap-4 rounded-2xl border p-5 transition-colors ${
                form.payment === "cod"
                  ? "border-forest-600 bg-forest-50"
                  : "border-line bg-paper"
              }`}
            >
              <input
                type="radio"
                name="payment"
                value="cod"
                checked={form.payment === "cod"}
                onChange={() => update("payment", "cod")}
                className="h-4 w-4 accent-forest-700"
              />
              <span className="flex-1">
                <span className="block text-sm font-semibold text-ink">
                  {t("checkout.cashOnDelivery")}
                </span>
                <span className="mt-0.5 block text-xs leading-5 text-ink-soft">
                  {t("checkout.cashOnDeliveryText")}
                </span>
              </span>
              <span className="rounded-full bg-ivory-100 px-3 py-1 text-xs font-semibold text-forest-800 ring-1 ring-line">
                {t("checkout.primary")}
              </span>
            </label>
            <div className="flex items-center gap-4 rounded-2xl border border-dashed border-line bg-ivory-100/60 p-5">
              <input
                type="radio"
                aria-label="Online payment — coming soon"
                disabled
                className="h-4 w-4 accent-forest-700"
              />
              <span className="flex-1">
                <span className="block text-sm font-medium text-ink">
                  {t("checkout.onlinePayment")}{" "}
                  <span className="ml-1 rounded-full bg-gold-200 px-2.5 py-0.5 text-[0.65rem] font-bold uppercase tracking-wide text-gold-700">
                    {t("checkout.soon")}
                  </span>
                </span>
                <span className="mt-0.5 block text-xs text-ink-soft">
                  {t("checkout.onlinePaymentText")}
                </span>
              </span>
            </div>
          </div>
        </section>

        <CheckoutAssurance />
        {orderError && (
          <p
            role="alert"
            className="mt-8 rounded-2xl bg-rose-50 px-5 py-4 text-sm leading-6 text-rose-800 ring-1 ring-rose-200"
          >
            {orderError}
          </p>
        )}
        <button
          type="submit"
          disabled={form.submitting}
          className="mt-10 inline-flex h-14 w-full items-center justify-center gap-2 rounded-full bg-forest-800 text-sm font-semibold text-ivory-50 transition-colors hover:bg-forest-700 disabled:opacity-60 sm:w-auto sm:px-10"
        >
          {form.submitting ? t("checkout.placingOrder") : t("checkout.placeOrder")}
          {!form.submitting && <IconArrowRight className="h-4 w-4" />}
        </button>
        <p className="mt-4 text-xs leading-5 text-ink-soft">
          By placing the order you agree to our{" "}
          <Link href="/terms" className="underline underline-offset-2">
            Terms
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="underline underline-offset-2">
            Privacy Policy
          </Link>
          . Pressing once is enough — duplicate submissions are blocked.
        </p>
      </form>

      {/* Order summary */}
      <aside>
        <div className="sticky top-28 rounded-3xl bg-paper p-7 ring-1 ring-line">
          <h2 className="font-display text-xl font-medium text-forest-900">
            {t("checkout.yourOrder")}
          </h2>
          <p className="mt-1.5 flex items-center gap-2 text-sm font-semibold text-forest-800">
            <IconTruck className="h-4 w-4 shrink-0 text-gold-600" />
            {INSTANT_DELIVERY_TITLE} — arrives in {DELIVERY_ETA}
          </p>
          <div className="mt-4">
            <BagShopHeader />
          </div>
          <ul className="mt-5 space-y-4">
            {detail.map((line) => (
              <li
                key={line.product.id + line.variantLabel}
                className="flex gap-4"
              >
                <span className="relative block aspect-[4/5] w-14 shrink-0 overflow-hidden rounded-lg bg-ivory-100 ring-1 ring-line">
                  <Image
                    src={line.product.media[0].src}
                    alt=""
                    fill
                    sizes="56px"
                    className="object-cover"
                  />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-ink">
                    {line.product.name}
                  </span>
                  <span className="mt-0.5 block text-xs text-ink-soft">
                    {line.variantLabel} · Qty {line.qty}
                  </span>
                </span>
                <span className="text-sm font-semibold text-ink">
                  {formatBdt(line.lineTotal)}
                </span>
              </li>
            ))}
          </ul>
          {/* Coupon (§56) */}
          <div className="mt-6 border-t border-line pt-5">
            <label className="mb-1.5 block text-xs font-medium text-ink">
              {t("checkout.haveCoupon")}
            </label>
            {activeCoupon ? (
              <div className="flex items-center justify-between rounded-xl bg-forest-50 px-3.5 py-2.5 text-sm ring-1 ring-forest-200">
                <span className="font-mono font-bold text-forest-800">
                  {activeCoupon.code}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setAppliedCode("");
                    setCouponCheck({ code: null, discount: 0, problem: null });
                    setCouponMsg(null);
                    update("couponCode", "");
                  }}
                  className="text-xs font-semibold text-ink-soft underline underline-offset-2 hover:text-rose-700"
                >
                  {t("checkout.remove")}
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <input
                  value={form.couponCode}
                  onChange={(e) =>
                    update("couponCode", e.target.value.toUpperCase())
                  }
                  onKeyDown={(e) =>
                    e.key === "Enter" && (e.preventDefault(), applyCoupon())
                  }
                  placeholder="e.g. WELCOME100"
                  aria-label="Coupon code"
                  className="h-11 w-full min-w-0 rounded-xl bg-ivory-50 px-3.5 text-sm uppercase tracking-wide text-ink ring-1 ring-line placeholder:normal-case placeholder:tracking-normal placeholder:text-ink-soft/50 focus:ring-2 focus:ring-forest-500"
                />
                <button
                  type="button"
                  onClick={applyCoupon}
                  className="shrink-0 rounded-xl bg-forest-800 px-4 text-xs font-semibold text-ivory-50 transition-colors hover:bg-forest-700"
                >
                  {t("checkout.apply")}
                </button>
              </div>
            )}
            {couponCheck.problem && (
              <p role="status" className="mt-2 text-xs leading-5 text-rose-700">
                {couponCheck.problem}
              </p>
            )}
            {couponMsg && !couponCheck.problem && (
              <p
                role="status"
                className={`mt-2 text-xs leading-5 ${
                  couponMsg.ok ? "text-emerald-700" : "text-rose-700"
                }`}
              >
                {couponMsg.text}
              </p>
            )}
          </div>

          <dl className="mt-5 space-y-2.5 border-t border-line pt-5 text-sm">
            <div className="flex justify-between">
              <dt className="text-ink-soft">{t("checkout.subtotal")}</dt>
              <dd className="font-medium text-ink">{formatBdt(subtotal)}</dd>
            </div>
            {summary.discount > 0 && activeCoupon && (
              <div className="flex justify-between">
                <dt className="text-ink-soft">{t("checkout.coupon")} · {activeCoupon.code}</dt>
                <dd className="font-medium text-emerald-700">
                  −{formatBdt(summary.discount)}
                </dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="text-ink-soft">{t("checkout.delivery")} · {zone.etaLabel}</dt>
              <dd className="font-medium text-ink">
                {summary.freeDelivery ? (
                  <span className="text-forest-700">
                    Free{" "}
                    <span className="text-ink-soft line-through">
                      {formatBdt(summary.fullCharge)}
                    </span>
                  </span>
                ) : (
                  formatBdt(summary.charge)
                )}
              </dd>
            </div>
            {!summary.freeDelivery && subtotal < FREE_DELIVERY_THRESHOLD && (
              <p className="rounded-xl bg-ivory-100 px-3 py-2 text-xs leading-5 text-ink-soft">
                {formatBdt(FREE_DELIVERY_THRESHOLD - subtotal)} more also
                unlocks free delivery.
              </p>
            )}
            <div className="flex justify-between pt-2 text-base">
              <dt className="font-semibold text-ink">{t("checkout.totalCod")}</dt>
              <dd className="font-bold text-ink">{formatBdt(summary.total)}</dd>
            </div>
          </dl>
          <p className="mt-5 flex items-start gap-2 rounded-xl bg-ivory-100 px-3.5 py-3 text-xs leading-5 text-ink-soft">
            <IconBox className="mt-0.5 h-4 w-4 shrink-0 text-forest-700" />
            {t("checkout.followOrderHint")}
          </p>
        </div>
      </aside>
    </div>
  );
}
