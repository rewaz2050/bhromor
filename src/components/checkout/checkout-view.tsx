"use client";

/**
 * Checkout — three steps, one form (UX audit 2026-09-18, Batch E).
 *
 *   ① আপনার তথ্য        name · phone · address ladder
 *   ② ডেলিভারি ও পেমেন্ট  home delivery / pickup · time slot · payment
 *   ③ দেখে নিন ও অর্ডার   review · place order
 *   + "আরও অপশন"          gift · referral · tip · coupon · address label · note
 *
 * Every field stays mounted inside the SAME <form> (the accordion only hides
 * its body), so keyboard users, autofill and the tests see one document.
 * Pricing is a client-side estimate — the server re-derives every number.
 */

import CheckoutAssurance from "./checkout-assurance";
import { isPlausibleBdPhone, tidyPhoneInput } from "@/lib/phone";
import { GiftStep, ReferralField, GIFT_OFF, giftFeeFor, giftPayload, type GiftFormValue } from "./gift-referral-step";
import { useBagOffer } from "@/lib/use-bag-offer";
import { validateGift } from "@/lib/gift";
import {
  clearStoredRef,
  normalizeRefCode,
  referralLink,
} from "@/lib/referral";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useCart } from "@/components/cart/cart-provider";
import ReceiptReferralRow from "@/components/checkout/receipt-referral-row";
import ReceiptRail from "@/components/checkout/receipt-rail";
import NotifyOptIn from "@/components/track/notify-opt-in";
import { haptic } from "@/lib/haptics";
import BagSkeleton from "@/components/cart/bag-skeleton";
import { useLiveZones } from "@/lib/use-live-zones";
import { useLiveCatalog } from "@/lib/use-live-catalog";
import type { Product } from "@/lib/catalog";
import {
  isShopOrderable,
  lineShopIds,
  shopById,
} from "@/lib/shop-utils";
import { getDeliveryCode, type Order } from "@/lib/orders";
import { formatBdt } from "@/lib/format";
import {
  DELIVERY_CHARGE_LADDER_BN,
  DELIVERY_CHARGE_PROMISE_BN,
  DELIVERY_CHARGE_PROMISE_EN,
  INSTANT_DELIVERY_TITLE,
  NIGHT_SURCHARGE_PAISA,
  RAIN_SURCHARGE_PAISA,
  courierEta,
  deliveryBreakdown,
  isCourierZone,
  isNightHour,
  orderTotal,
} from "@/lib/delivery";
import { usePublicSettings } from "@/lib/use-public-settings";
import { freeDeliveryFor, freeDeliveryOffers } from "@/lib/free-delivery";
import {
  IconArrowRight,
  IconBag,
  IconCheck,
  IconCopy,
  IconGift,
  IconMapPin,
  IconShield,
  IconTruck,
  IconSparkles,
  IconMoon,
  IconCalendar,
  IconHome,
  IconStore,
  IconBriefcase,
  IconBolt,
} from "@/components/ui/icons";
import { useLanguage } from "@/components/i18n/language-provider";
import {
  DISTRICTS,
  PARA_CUSTOM,
  ROAD_NAMES,
  SADAR_PARA_OPTIONS,
  SUNAMGANJ_BOUNDS,
  SUNAMGANJ_DISTRICT,
  SUNAMGANJ_HUB,
  SUNAMGANJ_UPAZILA,
  SUNAMGANJ_UPAZILAS,
  deriveZoneChoice,
  distanceFromHubKm,
  findZoneByDistance,
  type LatLng,
} from "@/lib/sunamganj";
import {
  ADDRESS_TAG_EMOJI,
  getSavedAddresses,
  saveAddress,
  deleteAddress,
  type AddressTag,
  type SavedAddress,
} from "@/lib/address-book";
import { getUpazilasForDistrict } from "@/lib/bd-geo";
import { useCustomer } from "@/lib/use-customer";
import { useSmartCard } from "@/lib/use-smart-card";
import MapPinPicker from "./map-pin-picker";
import {
  CheckoutProgress,
  ReceiptNextSteps,
  MoreOptions,
  OrderErrorBanner,
  StepSection,
  StickyOrderBar,
} from "./checkout-ui";
import OrderSummaryCard, { type PlusState, type PriceSummary } from "./order-summary-card";
import {
  fieldForServerError,
  firstErrorField,
  friendlyOrderError,
  type FriendlyError,
} from "@/lib/checkout-errors";
import {
  DELIVERY_SLOT_LABELS,
  SLOT_START_HOUR,
  deliverySlotSummary,
  dhakaDateAtHourMs,
  dhakaDateString,
  eveningScheduleIso,
  eveningSlotHint,
  type DeliverySlotKey,
} from "@/lib/delivery-slots";
import { saveLastOrder, trackHref } from "@/lib/last-order";
import { track, trackPurchaseOnce } from "@/lib/analytics";
import { useNow } from "@/lib/use-now";

type TimeSlot = "now" | "evening" | "scheduled";
type DeliveryWindow = Exclude<DeliverySlotKey, "now" | "evening">;
const SCHEDULE_WINDOWS: DeliveryWindow[] = ["9-11", "11-1", "2-4", "4-6", "6-8", "8-10"];

interface FormState {
  name: string;
  phone: string;
  district: string;
  upazila: string;
  upazilaCustom: string;
  paraSelected: string;
  paraCustom: string;
  houseNo: string;
  roadName: string;
  address: string;
  note: string;
  couponCode: string;
  timeSlot: TimeSlot;
  deliveryDate: string; // YYYY-MM-DD (Asia/Dhaka)
  deliveryWindow: DeliveryWindow;
  isPickup: boolean;
  pickupSlot: string;
  tipAmount: number; // taka
  /** P1 #8 — wallet payment choice; 'cod' is the default. */
  payMethod: "cod" | "bkash" | "nagad";
  /** P1 #8 — TRXID from the wallet transfer. */
  trxid: string;
  submitting: boolean;
}

/** Module-level "today" (Dhaka calendar) — bounds the date picker. */
const NOW_MS = Date.now();
const MIN_DELIVERY_DATE = dhakaDateString(NOW_MS);
const MAX_DELIVERY_DATE = dhakaDateString(NOW_MS + 3 * 86400000);

const initialForm: FormState = {
  name: "",
  phone: "",
  district: SUNAMGANJ_DISTRICT,
  upazila: SUNAMGANJ_UPAZILA,
  upazilaCustom: "",
  paraSelected: "",
  paraCustom: "",
  houseNo: "",
  roadName: "",
  address: "",
  note: "",
  couponCode: "",
  timeSlot: "now",
  deliveryDate: MIN_DELIVERY_DATE,
  deliveryWindow: "2-4",
  isPickup: false,
  pickupSlot: "now",
  tipAmount: 0,
  payMethod: "cod",
  trxid: "",
  submitting: false,
};

const isSunamganjDistrict = (district: string) =>
  district.trim().toLowerCase() === SUNAMGANJ_DISTRICT.toLowerCase();
const isSadarUpazila = (upazila: string) =>
  upazila.trim().toLowerCase() === SUNAMGANJ_UPAZILA.toLowerCase();

/** jsdom has no scrollIntoView — never let a scroll throw inside a submit. */
const scrollTo = (el: Element | null | undefined, block: ScrollLogicalPosition = "center") => {
  if (!el) return;
  if (typeof (el as HTMLElement).scrollIntoView === "function") {
    (el as HTMLElement).scrollIntoView({ behavior: "smooth", block });
  }
};



/* ------------------------------------------------------------------ */
/* bKash / Nagad — number + amount with one-tap copy, TRXID input       */
/* (UX audit 2026-09-18, P1 #12)                                         */
/* ------------------------------------------------------------------ */

const TRXID_RE = /^[A-Z0-9]{8,14}$/;

function WalletPaySteps({
  method,
  number,
  amount,
  trxid,
  error,
  inputRef,
  inputClassName,
  onTrxid,
}: {
  method: "bkash" | "nagad";
  number: string;
  amount: number;
  trxid: string;
  error?: string;
  inputRef: React.RefObject<HTMLInputElement | null>;
  inputClassName: string;
  onTrxid: (value: string) => void;
}) {
  const { t } = useLanguage();
  const [copied, setCopied] = useState<"number" | "amount" | null>(null);
  const timer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );
  const brand = method === "bkash" ? "bKash" : "Nagad";
  const tone =
    method === "bkash"
      ? "border-[#e2136e]/30 bg-[#fdf2f8]"
      : "border-[#f6921e]/30 bg-[#fff8f0]";
  const takaWhole = Math.round(amount / 100);
  const copy = async (what: "number" | "amount") => {
    const text = what === "number" ? number : String(takaWhole);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Clipboard blocked (http / old WebView) — the value is still selectable.
    }
    setCopied(what);
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(null), 1800);
  };
  const clean = trxid.trim();
  const looksShort = clean.length > 0 && clean.length < 8;
  const looksWrong = clean.length >= 8 && !TRXID_RE.test(clean);

  return (
    <div className={`rounded-2xl border p-5 ${tone}`} data-testid="wallet-steps">
      <p className="text-sm font-semibold text-ink">{brand} — {t("checkout.sendExactly")}</p>

      {/* Number + amount, each with its own copy button (44px) */}
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <div className="flex items-center justify-between gap-3 rounded-xl bg-paper px-4 py-3 ring-1 ring-line">
          <div className="min-w-0">
            <p className="text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-ink-soft">
              {brand} Personal
            </p>
            <p className="select-all font-mono text-base font-bold tracking-wide text-ink" data-testid="wallet-number">
              {number}
            </p>
          </div>
          <button
            type="button"
            onClick={() => copy("number")}
            aria-label={t("checkout.copyNumber")}
            data-testid="copy-wallet-number"
            className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full bg-forest-800 px-3.5 text-xs font-semibold text-ivory-50 hover:bg-forest-700"
          >
            {copied === "number" ? <IconCheck className="h-3.5 w-3.5" /> : <IconCopy className="h-3.5 w-3.5" />}
            {copied === "number" ? t("checkout.copied") : t("checkout.copyNumber")}
          </button>
        </div>
        <div className="flex items-center justify-between gap-3 rounded-xl bg-paper px-4 py-3 ring-1 ring-line">
          <div className="min-w-0">
            <p className="text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-ink-soft">
              {t("checkout.total")}
            </p>
            <p className="select-all font-mono text-base font-bold text-ink" data-testid="wallet-amount">
              {formatBdt(amount)}
            </p>
          </div>
          <button
            type="button"
            onClick={() => copy("amount")}
            aria-label={t("checkout.copyAmount")}
            data-testid="copy-wallet-amount"
            className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full bg-paper px-3.5 text-xs font-semibold text-forest-900 ring-1 ring-line hover:bg-ivory-100"
          >
            {copied === "amount" ? <IconCheck className="h-3.5 w-3.5" /> : <IconCopy className="h-3.5 w-3.5" />}
            {copied === "amount" ? t("checkout.copied") : t("checkout.copyAmount")}
          </button>
        </div>
      </div>

      <ol className="mt-3 list-decimal space-y-1 pl-5 text-xs leading-6 text-ink-soft">
        <li>
          {brand} অ্যাপ → <strong className="text-ink">Send Money</strong> → উপরের নম্বরে{" "}
          <strong className="text-ink">{formatBdt(amount)}</strong> পাঠান।
        </li>
        <li>
          সফল হলে অ্যাপ/SMS-এ <strong className="text-ink">TRXID</strong> দেখাবে — সেটি নিচে লিখুন।
        </li>
        <li>দোকান নিজের wallet-এ মিলিয়ে order confirm করবে।</li>
      </ol>

      <label className="mt-3 block">
        <span className="mb-1.5 block text-sm font-medium text-ink">
          TRXID (Transaction ID) <span className="text-rose-600">*</span>
        </span>
        <input
          ref={inputRef}
          value={trxid}
          onChange={(e) => onTrxid(e.target.value.toUpperCase().replace(/\s+/g, ""))}
          placeholder="e.g. 9K2L7M4QXZ"
          inputMode="text"
          autoComplete="off"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          maxLength={20}
          aria-invalid={!!error || looksWrong}
          aria-describedby="trxid-help"
          className={`${inputClassName} font-mono tracking-[0.12em]`}
        />
        <span id="trxid-help" className="mt-1.5 block text-[11px] leading-5 text-ink-soft">
          {t("checkout.trxidHelp")}
        </span>
        {(looksShort || looksWrong) && !error ? (
          <p className="mt-1 text-xs text-amber-800" data-testid="trxid-hint">
            {t("checkout.trxidLooksShort")}
          </p>
        ) : null}
        {error && <p className="mt-1.5 text-xs text-rose-700">{error}</p>}
      </label>
      <p className="mt-2 text-[11px] leading-5 text-ink-soft">
        দোকান verify করার আগ পর্যন্ত order “payment under verification” থাকবে —
        রাইডার পাঠানো হবে না। ভুল হয়ে গেলে track page থেকে বাতিল করা যাবে।
      </p>
    </div>
  );
}

/** Copy a saved address into the form (P1 #16) — shared by the auto prefill
 *  and the "use this one" button, so both fill exactly the same fields. */
const applySavedAddress = (f: FormState, addr: SavedAddress): FormState => {
  const savedPara = addr.area;
  const listed = SADAR_PARA_OPTIONS.some((p) => p.name === savedPara);
  const savedDistrict = addr.district || SUNAMGANJ_DISTRICT;
  const savedUpazila = addr.upazila || SUNAMGANJ_UPAZILA;
  return {
    ...f,
    name: addr.name,
    phone: addr.phone,
    district: savedDistrict,
    upazila: isSunamganjDistrict(savedDistrict)
      ? SUNAMGANJ_UPAZILAS.some((u) => u.en === savedUpazila)
        ? savedUpazila
        : SUNAMGANJ_UPAZILA
      : f.upazila,
    upazilaCustom: isSunamganjDistrict(savedDistrict) ? f.upazilaCustom : savedUpazila,
    paraSelected: listed ? savedPara : PARA_CUSTOM,
    paraCustom: savedPara,
    houseNo: addr.houseNo,
    roadName: addr.roadName,
    address: addr.fullAddress,
    note: addr.note,
  };
};

export default function CheckoutView() {
  const { t, lang } = useLanguage();
  const { detail, subtotal, clear, ready } = useCart();
  /** Wall clock for the slot chips — a store, so render stays pure. */
  const nowMs = useNow(60_000);
  const { activeZones: zoneList } = useLiveZones();
  const { shops } = useLiveCatalog();
  // The OWNER's numbers, read-only and public — never the staff hook
  // (a customer is not signed in to the dashboard). Defaults while loading.
  const { settings } = usePublicSettings();
  const bagShop =
    shopById(
      shops,
      lineShopIds(detail, shops[0]?.id ?? "")[0] ?? "",
    ) ?? null;
  const [form, setForm] = useState<FormState>(initialForm);
  const [placed, setPlaced] = useState<{
    orderId: string;
    phone: string;
    eta: string;
    charge: number;
    total: number;
    addressSummary: string;
    cardFull?: boolean;
    smartCardNote?: string;
    deliveryCode?: string;
    /** P1 #8 — wallet orders say so on the receipt, with the honest state. */
    payment?: "cod" | "bkash" | "nagad";
    /** One line on the receipt: the gift is booked, not just ticked. */
    giftNote?: string;
    /** "Evening (6–9 PM) · 18 Sep, 6:00 pm" — the slot the shop will plan around. */
    slotNote?: string | null;
    /** P2 #18 — the "what happens next" list is built from THIS order. */
    isPickup?: boolean;
    isCourier?: boolean;
    /** UX plan §6 (R5) — what was bought, for the "you may also like" rail. */
    ordered?: Product[];
  } | null>(null);
  const [copied, setCopied] = useState(false);

  /* P0 gift mode + referral code — local state, sent as intents. The server
     prices the wrap fee and proves the code; this form only estimates. */
  const [giftValue, setGiftValue] = useState<GiftFormValue>(GIFT_OFF);
  const [referralCode, setReferralCode] = useState("");

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
  /* P1 #8 — the shop's OWN wallet numbers (no merchant account). A method
     with no configured number is simply not offered — COD always works. */
  const [wallets, setWallets] = useState<{ bkash?: string; nagad?: string } | null>(null);
  // P2 #17 — is the phone typed here an ACTIVE PROSANTI+ member? The server
  // answers (the client cannot claim it) and the same question is re-asked by
  // the place-order RPC at confirmation; this only makes the quote honest.
  const [plusState, setPlusState] = useState<PlusState>("idle");
  const plusActive = plusState === "active";
  // begin_checkout (pixel/GA, only when configured): once per checkout visit,
  // as soon as the bag has resolved against the live catalog.
  const beganCheckout = useRef(false);
  useEffect(() => {
    if (beganCheckout.current || !ready || detail.length === 0) return;
    beganCheckout.current = true;
    track({
      type: "begin_checkout",
      items: detail.map((l) => ({
        id: l.product.id,
        name: l.product.name,
        category: l.product.category,
        price: l.qty > 0 ? Math.round(l.lineTotal / l.qty) : l.product.price,
        qty: l.qty,
        shopId: l.product.shopId,
      })),
      value: subtotal,
    });
  }, [ready, detail, subtotal]);
  useEffect(() => {
    let live = true;
    fetch("/api/payments")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (live && data && typeof data === "object") {
          setWallets(data as { bkash?: string; nagad?: string });
        }
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  const submittingRef = useRef(false);
  const [orderError, setOrderError] = useState<FriendlyError | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [moreOpen, setMoreOpen] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const paraRef = useRef<HTMLInputElement>(null);
  const addressRef = useRef<HTMLTextAreaElement>(null);
  const trxidRef = useRef<HTMLInputElement>(null);
  const couponRef = useRef<HTMLInputElement>(null);
  const giftWrapRef = useRef<HTMLDivElement>(null);
  const referralWrapRef = useRef<HTMLDivElement>(null);
  const step2Ref = useRef<HTMLDivElement>(null);
  const reviewRef = useRef<HTMLDivElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const ctaRef = useRef<HTMLButtonElement>(null);
  const [stickyVisible, setStickyVisible] = useState(false);

  const [savedAddrs, setSavedAddrs] = useState<SavedAddress[]>([]);
  const [showSaved, setShowSaved] = useState(false);
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoNote, setGeoNote] = useState<string | null>(null);
  const [pinPos, setPinPos] = useState<LatLng | null>(null);
  const [showMap, setShowMap] = useState(false);
  const [addrTag, setAddrTag] = useState<AddressTag>("home");
  const [bestLoading, setBestLoading] = useState(false);

  /* P1 #16 — a repeat customer's last address (name, phone, para, house,
     pin) fills the form by itself; the "saved addresses" sheet stays for
     picking a different one. Only ever on an untouched form, only once. */
  const [prefilledFrom, setPrefilledFrom] = useState<SavedAddress | null>(null);
  const prefillDone = useRef(false);
  useEffect(() => {
    const all = getSavedAddresses();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage hydration must happen post-mount
    setSavedAddrs(all);
    if (prefillDone.current || all.length === 0) return;
    prefillDone.current = true;
    const last = all[0];
    setForm((f) => {
      if (f.name.trim() || f.phone.trim() || f.address.trim() || f.houseNo.trim()) return f;
      return applySavedAddress(f, last);
    });
    if (last.lat && last.lng) setPinPos({ lat: last.lat, lng: last.lng });
    setPrefilledFrom(last);
  }, []);

  /* ------------------------------------------------------------------ */
  /* Smart Card — stamps accumulate on the signed-in account only        */
  /* ------------------------------------------------------------------ */
  const { customer: cardCustomer, checked: cardChecked } = useCustomer();
  const { card: smartCard } = useSmartCard();
  useEffect(() => {
    if (cardCustomer && (!form.phone || !form.name)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- prefill empty fields after session resolve
      setForm((f) => ({ ...f, phone: f.phone || cardCustomer.phone, name: f.name || cardCustomer.name }));
    }
  }, [cardCustomer, form.phone, form.name]);

  useEffect(() => {
    let cancelled = false;
    const phone = (form.phone ?? "").trim();
    if (!isPlausibleBdPhone(phone)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset path only
      setPlusState("idle");
      return;
    }
    const timer = setTimeout(async () => {
      setPlusState("checking");
      try {
        const res = await fetch(`/api/membership?phone=${encodeURIComponent(phone)}`, {
          cache: "no-store",
        });
        const data = res.ok ? ((await res.json()) as { state?: string }) : null;
        if (!cancelled) {
          const st = data?.state;
          setPlusState(
            st === "none" || st === "pending" || st === "active" || st === "expired" || st === "rejected"
              ? st
              : "idle",
          );
        }
      } catch {
        if (!cancelled) setPlusState("idle");
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [form.phone]);

  /* ------------------------------------------------------------------ */
  /* Simple-form derived values                                          */
  /* ------------------------------------------------------------------ */

  const sunamganjDistrict = isSunamganjDistrict(form.district);
  const effectiveUpazila = sunamganjDistrict
    ? form.upazila
    : form.upazilaCustom;
  const sadarUpazila = sunamganjDistrict && isSadarUpazila(effectiveUpazila);
  const effectivePara = sadarUpazila
    ? form.paraSelected === PARA_CUSTOM
      ? form.paraCustom
      : form.paraSelected
    : form.paraCustom;

  const derived = useMemo(
    () => deriveZoneChoice(form.district, effectiveUpazila, effectivePara),
    [form.district, effectiveUpazila, effectivePara],
  );
  const derivedZoneId = derived.zoneId;
  const zone = useMemo(
    () => zoneList.find((z) => z.id === derivedZoneId) ?? zoneList[0],
    [zoneList, derivedZoneId],
  );

  const cartKey = `${detail.map((l) => `${l.product.id}|${l.variantLabel}|${l.qty}`).join(",")}|${subtotal}|${derivedZoneId}`;
  const [couponFreeDelivery, setCouponFreeDelivery] = useState(false);
  useEffect(() => {
    if (!appliedCode) return;
    const items = detail.map((l) => ({ productId: l.product.id, qty: l.qty }));
    const timer = window.setTimeout(() => {
      void (async () => {
        interface ValidateResponse {
          valid?: boolean;
          code?: string;
          discount?: number;
          freeDelivery?: boolean;
          reason?: string | null;
          description?: string;
        }
        let data: ValidateResponse | null = null;
        try {
          const res = await fetch("/api/coupons/validate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ code: appliedCode, items, zoneId: derivedZoneId }),
          });
          data = (await res.json().catch(() => null)) as ValidateResponse | null;
          if (res.ok && data?.valid && data.code) {
            const isFree = !!data.freeDelivery;
            setCouponFreeDelivery(isFree);
            setCouponCheck({
              code: data.code,
              discount: isFree ? 0 : Math.max(0, Math.min(data.discount ?? 0, subtotal)),
              problem: null,
            });
            setCouponMsg({
              ok: true,
              text: isFree
                ? `${data.code} — Free Delivery ${data.description ? `· ${data.description}` : ""}`
                : `${data.code} applied — ${formatBdt(Math.max(0, Math.min(data.discount ?? 0, subtotal)))} off.${data.description ? ` ${data.description}` : ""}`,
            });
            return;
          }
        } catch {
          data = null;
        }
        setCouponFreeDelivery(false);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appliedCode, cartKey, derivedZoneId]);

  const activeCoupon = useMemo(
    () => (couponCheck.code ? { code: couponCheck.code } : null),
    [couponCheck.code],
  );

  /** The one automatic offer this bag earns (flash drop or a complete set). */
  const bagOffer = useBagOffer(detail);
  const giftCheck = useMemo(
    () => validateGift(giftPayload(giftValue), settings.gift),
    [giftValue, settings.gift],
  );
  const giftFee = giftFeeFor(giftValue, settings.gift);
  const referralCredit =
    referralCode.trim() === ""
      ? 0
      : Math.min(
          settings.referral.friendRewardPaisa,
          Math.max(
            0,
            subtotal -
              (activeCoupon ? couponCheck.discount : 0) -
              (bagOffer?.discount ?? 0),
          ),
        );

  const summary = useMemo<PriceSummary>(() => {
    if (!zone) {
      return {
        charge: 0,
        fullCharge: 0,
        freeDelivery: false,
        couponFree: false,
        plusFree: false,
        thresholdFree: null,
        discount: 0,
        promo: 0,
        promoKind: bagOffer?.kind ?? null,
        giftFee: 0,
        referral: 0,
        tip: 0,
        total: subtotal,
        itemCount: detail.reduce((n, l) => n + l.qty, 0),
        isOutside: derivedZoneId === "z4",
        breakdown: null,
        distanceKm: undefined,
        isNight: false,
        isRain: false,
      };
    }
    const distanceKm = pinPos ? distanceFromHubKm(pinPos) : undefined;
    const isNight = settings.nightSurchargeEnabled
      ? isNightHour(new Date().getHours())
      : false;
    const isRain = settings.rainSurchargeEnabled;
    const isExpress =
      form.deliveryWindow === "express" && settings.expressDeliveryEnabled;
    const weightKg = detail.reduce((s, l) => s + l.qty * 0.5, 0);
    // Free-delivery threshold (2026-09-26): the platform rule, then the
    // shop's own — the same helpers the validator and ps_place_order mirror.
    const alreadyFree = (couponFreeDelivery && !!activeCoupon) || plusActive;
    const thresholdOffer = freeDeliveryFor(
      subtotal,
      freeDeliveryOffers(settings.freeDelivery, bagShop),
      { courier: zone.id === "z4", pickup: form.isPickup, alreadyFree },
    );
    const breakdown = deliveryBreakdown({
      zone,
      subtotal,
      weightKg,
      isNight,
      isRain,
      isExpress,
      isPickup: form.isPickup,
      tipAmount: form.tipAmount * 100,
      couponFree: alreadyFree,
      thresholdFree: thresholdOffer?.by ?? null,
      shopPrepMinutes: bagShop?.prepMinutes ?? 15,
      queueCount: 0,
      rates: settings.surcharges,
    });
    const charge = breakdown.totalCharge;
    const discount = activeCoupon ? couponCheck.discount : 0;
    // Everything the shop can honour is re-derived from the same settings the
    // badges use; the RPC recomputes it again at placement.
    const promo = bagOffer?.discount ?? 0;
    const capped = Math.min(promo + referralCredit, Math.max(0, subtotal - discount));
    return {
      charge,
      fullCharge: breakdown.baseCharge,
      freeDelivery: breakdown.freeDelivery,
      couponFree: couponFreeDelivery && !!activeCoupon,
      plusFree: plusActive && !form.isPickup,
      thresholdFree: breakdown.thresholdFree,
      discount,
      promo: capped,
      promoKind: bagOffer?.kind ?? null,
      giftFee,
      referral: referralCredit,
      tip: form.tipAmount * 100,
      total:
        orderTotal(subtotal, charge, discount + capped) +
        form.tipAmount * 100 +
        giftFee,
      itemCount: detail.reduce((n, l) => n + l.qty, 0),
      isOutside: derivedZoneId === "z4",
      breakdown,
      distanceKm,
      isNight,
      isRain,
    };
  }, [
    bagOffer,
    giftFee,
    referralCredit,
    zone,
    subtotal,
    detail,
    activeCoupon,
    couponCheck.discount,
    couponFreeDelivery,
    pinPos,
    settings,
    bagShop,
    form.deliveryWindow,
    form.isPickup,
    plusActive,
    form.tipAmount,
    derivedZoneId,
  ]);

  const empty = detail.length === 0;
  const shopClosed = bagShop ? !isShopOrderable(bagShop) : false;
  const mixedBag = lineShopIds(detail, shops[0]?.id ?? "").length > 1;

  /* P0 #3 — the minimum outside Sunamganj Sadar, said BEFORE the tap. */
  const courierFloor = settings.courierMinOrderPaisa;
  const courierMinLabel = `৳${Math.round(courierFloor / 100)}`;
  const minOrderShortfall =
    summary.isOutside && !form.isPickup
      ? Math.max(0, courierFloor - subtotal)
      : 0;

  /* Step completion — drives the progress rail and the sticky bar hint. */
  const phoneOk = /^(?:\+?88)?01[0-9]{9}$/.test(form.phone.replace(/[\s\-]/g, ""));
  const step1Done =
    form.name.trim().length >= 2 &&
    phoneOk &&
    effectivePara.trim().length >= 2 &&
    (form.isPickup || form.address.trim().length >= 6);
  const step2Done = step1Done && (form.payMethod === "cod" || form.trxid.trim().length >= 6);
  const currentStep: 1 | 2 | 3 = !step1Done ? 1 : !step2Done ? 2 : 3;

  const submitBlocked = form.submitting || mixedBag || shopClosed || minOrderShortfall > 0;

  /* Sticky bar — phones only, appears once the real button scrolls away. */
  useEffect(() => {
    const node = ctaRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([entry]) => setStickyVisible(!entry.isIntersecting),
      { rootMargin: "0px 0px -80px 0px", threshold: 0 },
    );
    observer.observe(node);
    return () => observer.disconnect();
    // Re-attach when the form (and its button) mounts — `ready`/`empty`/`placed` gate it.
  }, [ready, empty, placed]);

  if (placed) {
    const deliveryCode = placed.deliveryCode ?? getDeliveryCode(placed.orderId);
    const copyOrderId = async () => {
      try {
        await navigator.clipboard.writeText(placed.orderId);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
      } catch {
        /* clipboard blocked — the id is selectable text */
      }
    };
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
          ধন্যবাদ{form.name ? `, ${form.name.split(" ")[0]}` : ""}। আপনার ডেলিভারি প্রস্তুত করা হচ্ছে।
        </p>

        {/* Order ID — big, selectable, one-tap copy (P0 #5) */}
        <div className="mx-auto mt-5 flex max-w-sm items-center justify-between gap-3 rounded-2xl bg-paper px-4 py-3 ring-1 ring-line">
          <div className="min-w-0 text-left">
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-ink-soft">অর্ডার নম্বর</p>
            <p className="select-all font-mono text-base font-bold text-forest-900" data-testid="receipt-order-id">
              {placed.orderId}
            </p>
          </div>
          <button
            type="button"
            onClick={copyOrderId}
            className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-forest-50 px-3.5 text-xs font-semibold text-forest-900 ring-1 ring-forest-200 hover:bg-forest-100"
            aria-label={t("checkout.copyOrderId")}
          >
            {copied ? <IconCheck className="h-3.5 w-3.5" /> : <IconCopy className="h-3.5 w-3.5" />}
            {copied ? t("checkout.copied") : t("checkout.copyOrderId")}
          </button>
        </div>
        <p className="mt-2 text-xs text-ink-soft">{t("checkout.screenshotHint")}</p>

        {/* 2026-09-24 — the shopper's phone, offered HERE because this is the
            one moment they are certainly looking: one tap and every step of
            this order (confirmed → প্যাকিং → রাইডার → পথে → ডেলিভারি) is pushed
            to the number they just ordered with. */}
        <div className="mx-auto mt-6 max-w-sm text-left">
          <NotifyOptIn orderId={placed.orderId} phone={placed.phone} />
        </div>

        {/* P0 #7 — the referral ask lands the moment the order is placed. */}
        <div className="mx-auto max-w-sm text-left">
          <ReceiptReferralRow />
        </div>

        {placed.cardFull && (
          <div
            role="status"
            className="mx-auto mt-6 max-w-sm rounded-2xl border border-gold-300 bg-gold-50 p-4 text-sm font-medium text-forest-900"
          >
            🎉 <strong>স্মার্ট কার্ড পূর্ণ!</strong> আপনি আকর্ষণীয় পুরস্কার
            জিতেছেন — পরবর্তী অর্ডারের সাথে উপহার পৌঁছে যাবে।
          </div>
        )}
        {placed.smartCardNote && !placed.cardFull && (
          <p className="mt-4 flex items-start gap-2 text-xs text-ink-soft">
            <IconGift className="mt-0.5 h-4 w-4 shrink-0 text-gold-600" />
            <span>
              {placed.smartCardNote} — প্রতি অর্ডারে ১টি করে পড়বে।
            </span>
          </p>
        )}

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
            পার্সেল ও ক্যাশ লেনদেনের সময় এই ৪-সংখ্যার কোডটি রাইডারকে বলুন।
          </p>
        </div>

        <div className="mx-auto mt-4 max-w-sm rounded-2xl bg-forest-50 p-3.5 ring-1 ring-forest-200 text-xs text-forest-900 flex items-center gap-2.5 text-left">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-forest-800 text-gold-300">
            <IconGift className="h-4 w-4" />
          </span>
          <div>
            <strong className="block font-semibold">১০-অর্ডার রিওয়ার্ড প্রগ্রেস</strong>
            <span className="text-ink-soft text-[11px]">
              এই অর্ডার ডেলিভারি রিসিভ করলে আপনার লয়্যালটি কার্ডে +১ স্ট্যাম্প যোগ হবে!
            </span>
          </div>
        </div>

        <div className="mx-auto mt-6 max-w-sm space-y-3 rounded-3xl bg-paper p-6 text-left text-sm ring-1 ring-line">
          <p className="flex items-center gap-3">
            <IconTruck className="h-5 w-5 text-forest-700" />
            আনুমানিক সময়:{" "}
            <strong className="text-ink">{placed.eta}</strong>
          </p>
          {placed.slotNote ? (
            <p className="flex items-center gap-3" data-testid="receipt-slot">
              <IconMoon className="h-4 w-4 shrink-0 text-gold-300" />
              <span>
                ডেলিভারি সময়: <strong className="text-ink">{placed.slotNote}</strong>
              </span>
            </p>
          ) : null}
          <p className="flex items-center gap-3">
            <IconMapPin className="h-5 w-5 text-forest-700" />
            <span className="text-ink-soft">{placed.addressSummary}</span>
          </p>
          {placed.giftNote ? (
            <p className="flex items-center gap-3 rounded-2xl bg-gold-50 px-4 py-3 text-forest-900 ring-1 ring-gold-200">
              <IconGift className="h-5 w-5 shrink-0 text-gold-600" />
              <span>
                {placed.giftNote} — {t("gift.riderNote")}
              </span>
            </p>
          ) : null}
          <p className="flex items-center justify-between border-t border-line pt-3 font-medium text-ink">
            {placed.payment && placed.payment !== "cod"
              ? `Total — ${placed.payment === "bkash" ? "bKash" : "Nagad"}`
              : `${t("checkout.totalCod")} — ${t("checkout.cashOnDelivery")}`}
            <span>{formatBdt(placed.total)}</span>
          </p>
        </div>

        {/* P2 #18 — what happens next, for THIS order (wallet / courier / pickup aware) */}
        <ReceiptNextSteps
          title={t("checkout.nextTitle")}
          steps={(() => {
            const wallet =
              placed.payment === "bkash" ? "bKash" : placed.payment === "nagad" ? "Nagad" : null;
            const steps: { title: string; body: string; when?: string | null }[] = [
              {
                title: t("track.stepConfirmed"),
                body: wallet
                  ? t("checkout.nextVerifyWallet").replace("{wallet}", wallet)
                  : t("checkout.nextConfirmCall"),
                when: lang === "bn" ? "কিছুক্ষণের মধ্যে" : "shortly",
              },
              placed.isPickup
                ? {
                    title: lang === "bn" ? "পিকআপ" : "Pickup",
                    body: t("checkout.nextPickup").replace("{hub}", SUNAMGANJ_HUB),
                    when: placed.eta,
                  }
                : placed.isCourier
                  ? {
                      title: lang === "bn" ? "কুরিয়ার" : "Courier",
                      body: t("checkout.nextCourier").replace("{eta}", courierEta(lang)),
                      when: null,
                    }
                  : {
                      title: t("track.stepPickedUp"),
                      body: t("checkout.nextPacked"),
                      when: placed.slotNote ?? placed.eta,
                    },
            ];
            if (!placed.isPickup) {
              steps.push({
                title: t("track.stepDelivered"),
                body: wallet
                  ? t("checkout.nextDeliverPaid")
                  : t("checkout.nextDeliverPin").replace("{total}", formatBdt(placed.total)),
                when: null,
              });
            }
            return steps;
          })()}
          footnote={t("checkout.nextCancelHint")}
        />

        {placed.payment && placed.payment !== "cod" && (
          <div
            role="status"
            className="mx-auto mt-4 max-w-sm rounded-2xl bg-amber-50 p-4 text-left text-xs leading-6 text-amber-900 ring-1 ring-amber-200"
          >
            <strong className="block text-sm font-semibold">
              {placed.payment === "bkash" ? "bKash" : "Nagad"} payment — under
              verification
            </strong>
            আপনি টাকা পাঠিয়েছেন — দোকান নিজের wallet-এ TRXID যাচাই করে order
            confirm করবে। Order টি track page-এ “payment under verification”
            status-এ দেখাবে; verify হলেই prep শুরু হবে। টাকা পাঠানোর আগে ভুল
            হলে track page থেকে বাতিল করুন।
          </div>
        )}

        <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
          <Link
            href={trackHref(placed.orderId, placed.phone)}
            data-testid="receipt-track-link"
            className="inline-flex h-12 items-center gap-2 rounded-full bg-forest-800 px-7 text-sm font-semibold text-ivory-50 transition-colors hover:bg-forest-700"
          >
            {t("checkout.trackOrder")} <IconArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="/shop"
            className="inline-flex h-12 items-center rounded-full bg-paper px-7 text-sm font-medium ring-1 ring-line"
          >
            {t("checkout.continueShopping")}
          </Link>
        </div>

        {/* UX plan §6 (R5) — the session need not end on the receipt. */}
        {placed.ordered && placed.ordered.length > 0 && (
          <div className="-mx-6 mt-12 text-left">
            <ReceiptRail ordered={placed.ordered} />
          </div>
        )}
      </div>
    );
  }

  // P0 #7 — stored lines are still waiting for the catalog: never say "empty".
  if (!ready) {
    return <BagSkeleton label={t("checkout.bagLoading")} />;
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

  const clearFieldError = (field: string) => {
    if (fieldErrors[field]) setFieldErrors((f) => ({ ...f, [field]: "" }));
  };

  const applyCoupon = () => {
    const code = form.couponCode.trim().toUpperCase();
    if (!code) return;
    setCouponCheck({ code: null, discount: 0, problem: null });
    setCouponMsg({ ok: true, text: "Checking code…" });
    setAppliedCode(code);
  };

  const removeCoupon = () => {
    setAppliedCode("");
    setCouponCheck({ code: null, discount: 0, problem: null });
    setCouponFreeDelivery(false);
    setCouponMsg(null);
    update("couponCode", "");
  };

  /** Auto-apply the single best redeemable coupon for this cart (server-priced). */
  const applyBestCoupon = async () => {
    if (bestLoading || activeCoupon) return;
    setBestLoading(true);
    setCouponMsg({ ok: true, text: "সেরা অফার খুঁজছি…" });
    try {
      const res = await fetch("/api/coupons/best", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: detail.map((l) => ({ productId: l.product.id, qty: l.qty })),
          zoneId: derivedZoneId,
        }),
      });
      const data = (await res.json().catch(() => null)) as {
        code?: string;
        freeDelivery?: boolean;
        description?: string;
      } | null;
      if (res.ok && data?.code) {
        setAppliedCode(data.code);
      } else {
        setCouponMsg({ ok: false, text: "এই মুহূর্তে কোনো প্রযোজ্য কুপন নেই।" });
      }
    } catch {
      setCouponMsg({ ok: false, text: "কুপন চেক করা যায়নি — আবার চেষ্টা করুন।" });
    } finally {
      setBestLoading(false);
    }
  };

  /** Full address string — house/road + para/upazila/district auto-append. */
  const buildFullAddress = () => {
    const segs: string[] = [];
    if (form.houseNo.trim()) segs.push(`House: ${form.houseNo.trim()}`);
    if (form.roadName.trim()) segs.push(`Road: ${form.roadName.trim()}`);
    if (form.address.trim()) segs.push(form.address.trim());
    if (effectivePara.trim()) segs.push(`Para: ${effectivePara.trim()}`);
    if (effectiveUpazila.trim()) segs.push(effectiveUpazila.trim());
    segs.push(form.district);
    if (pinPos) segs.push(`Pin: ${pinPos.lat.toFixed(5)},${pinPos.lng.toFixed(5)}`);
    return segs.join(", ");
  };

  const persistAddress = () => {
    try {
      saveAddress({
        label: `${ADDRESS_TAG_EMOJI[addrTag]} ${effectivePara || "Address"} - ${form.name.split(" ")[0]}`,
        name: form.name,
        phone: form.phone,
        area: effectivePara,
        houseNo: form.houseNo,
        roadName: form.roadName,
        fullAddress: form.address,
        note: form.note,
        zoneId: derivedZoneId,
        district: form.district,
        upazila: effectiveUpazila,
        tag: addrTag,
        lat: pinPos?.lat,
        lng: pinPos?.lng,
      });
    } catch {
      // storage unavailable — continue without saving
    }
  };

  const handleUseSaved = (addr: SavedAddress) => {
    setForm((f) => applySavedAddress(f, addr));
    if (addr.lat && addr.lng) setPinPos({ lat: addr.lat, lng: addr.lng });
    setPrefilledFrom(addr);
    setShowSaved(false);
  };

  const handleGeolocate = () => {
    if (!navigator.geolocation) return;
    setGeoLoading(true);
    setGeoNote(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const here: LatLng = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        const inside =
          here.lat <= SUNAMGANJ_BOUNDS.north &&
          here.lat >= SUNAMGANJ_BOUNDS.south &&
          here.lng <= SUNAMGANJ_BOUNDS.east &&
          here.lng >= SUNAMGANJ_BOUNDS.west;
        if (inside) {
          setPinPos(here);
          setShowMap(true);
        } else {
          // Never clamp a phone in Sylhet onto a Sunamganj street — say so.
          setGeoNote("আপনার বর্তমান লোকেশন সুনামগঞ্জ সদরের বাইরে — ম্যাপে বাড়ি পিন করুন বা ঠিকানা লিখুন।");
          setShowMap(true);
        }
        setGeoLoading(false);
      },
      () => {
        setGeoNote("লোকেশন পাওয়া যায়নি — ব্রাউজারে অনুমতি দিন বা ম্যাপে পিন করুন।");
        setGeoLoading(false);
      },
      { enableHighAccuracy: false, timeout: 5000 },
    );
  };

  const jumpToStep = (n: 1 | 2 | 3) => {
    const el =
      n === 1
        ? document.getElementById("checkout-step-1")
        : n === 2
          ? step2Ref.current
          : reviewRef.current;
    scrollTo(el, "start");
  };

  /** Take the shopper to the first field that needs attention (P0 #6). */
  const jumpToField = (field: string | null) => {
    const focusAndScroll = (el: HTMLElement | null) => {
      if (!el) return;
      scrollTo(el);
      el.focus({ preventScroll: true });
    };
    switch (field) {
      case "name":
        return focusAndScroll(nameRef.current);
      case "phone":
        return focusAndScroll(phoneRef.current);
      case "area":
      case "para":
      case "village":
      case "district":
      case "upazila":
        return focusAndScroll(paraRef.current);
      case "address":
        return focusAndScroll(addressRef.current);
      case "trxid":
      case "payMethod":
        return trxidRef.current ? focusAndScroll(trxidRef.current) : scrollTo(step2Ref.current, "start");
      case "timeSlot":
        return scrollTo(step2Ref.current, "start");
      case "couponCode":
        setMoreOpen(true);
        window.setTimeout(() => focusAndScroll(couponRef.current), 60);
        return;
      case "gift":
        setMoreOpen(true);
        window.setTimeout(() => scrollTo(giftWrapRef.current), 60);
        return;
      case "referralCode":
        setMoreOpen(true);
        window.setTimeout(() => scrollTo(referralWrapRef.current), 60);
        return;
      case "items":
        return scrollTo(reviewRef.current, "start");
      default:
        return scrollTo(errorRef.current);
    }
  };

  const placeOrder = async () => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    update("submitting", true);
    setOrderError(null);
    setFieldErrors({});

    const fail = (message: FriendlyError, fields?: Record<string, string>) => {
      submittingRef.current = false;
      update("submitting", false);
      setOrderError(message);
      const mapped: Record<string, string> = {};
      for (const [key, raw] of Object.entries(fields ?? {})) {
        if (!raw) continue;
        const friendly = friendlyOrderError(raw);
        mapped[key] = friendly.en && friendly.en !== friendly.bn ? `${friendly.bn} (${friendly.en})` : friendly.bn;
      }
      setFieldErrors(mapped);
      const first = firstErrorField(mapped);
      window.setTimeout(() => jumpToField(first), 30);
    };

    const localErrors: Record<string, string> = {};
    if (form.name.trim().length < 2)
      localErrors.name = "আপনার পুরো নাম লিখুন (কমপক্ষে ২ অক্ষর) — Please share your full name.";
    if (!phoneOk)
      localErrors.phone =
        "সঠিক মোবাইল নম্বর দিন — e.g. 017XXXXXXXX or +88017XXXXXXXX.";
    if (effectivePara.trim().length < 2)
      localErrors.area = "পাড়া / গ্রামের নাম লিখুন — please enter your village or area.";
    if (minOrderShortfall > 0)
      localErrors.items = `সুনামগঞ্জ সদর এলাকার বাইরে ন্যূনতম ${courierMinLabel} টাকার অর্ডার করতে হবে — আরও ${formatBdt(minOrderShortfall)} যোগ করুন।`;
    if (!form.isPickup && form.address.trim().length < 6)
      localErrors.address =
        "বাসা নম্বর, রোড, ল্যান্ডমার্ক সহ ঠিকানা লিখুন — full delivery address required.";
    if (form.payMethod !== "cod" && form.trxid.trim().length < 6)
      localErrors.trxid = `আগে ${formatBdt(summary.total)} ${
        form.payMethod === "bkash" ? "bKash" : "Nagad"
      } পাঠান, তারপর যে TRXID পেয়েছেন সেটি লিখুন।`;
    if (Object.keys(localErrors).length > 0) {
      fail(
        {
          bn: `${Object.keys(localErrors).length}টি ঘর ঠিক করুন — নিচে লাল চিহ্ন দেওয়া আছে।`,
          en: "Fix the highlighted fields.",
        },
        localErrors,
      );
      return;
    }

    const fullAddress = form.isPickup
      ? `Store Pickup — ${SUNAMGANJ_HUB}, ${SUNAMGANJ_UPAZILA}, ${SUNAMGANJ_DISTRICT}`
      : buildFullAddress();

    // P0 #4 — the evening pick carries a real instant, not just a word.
    let scheduledAt: string | null = null;
    if (!form.isPickup && form.timeSlot === "scheduled") {
      const at = dhakaDateAtHourMs(form.deliveryDate, SLOT_START_HOUR[form.deliveryWindow]);
      scheduledAt = at === null ? null : new Date(at).toISOString();
    } else if (!form.isPickup && form.timeSlot === "evening") {
      scheduledAt = eveningScheduleIso(Date.now());
    }
    const deliveryWindow = form.isPickup
      ? null
      : form.timeSlot === "scheduled"
        ? form.deliveryWindow
        : form.timeSlot;

    let res: Response;
    try {
      res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          phone: form.phone,
          district: form.district,
          upazila: effectiveUpazila,
          para: effectivePara,
          area: effectivePara,
          address: fullAddress,
          note: form.note,
          zoneId: zone.id,
          lat: pinPos?.lat,
          lng: pinPos?.lng,
          distance_km: summary.distanceKm,
          scheduled_at: scheduledAt,
          delivery_window: deliveryWindow,
          is_express:
            form.timeSlot === "scheduled" &&
            form.deliveryWindow === "express" &&
            settings.expressDeliveryEnabled,
          is_pickup: form.isPickup,
          pickup_slot: form.isPickup ? form.pickupSlot : null,
          tip_amount: form.tipAmount * 100,
          weight_kg: detail.reduce((s, l) => s + l.qty * 0.5, 0),
          is_rain: settings.rainSurchargeEnabled,
          couponCode: activeCoupon?.code,
          gift: giftPayload(giftValue),
          referral_code:
            referralCode.trim() === "" ? undefined : normalizeRefCode(referralCode),
          // P1 #8 — wallet payment intent; the server re-validates the
          // method against the configured wallets and requires the TRXID.
          payment_method: form.payMethod,
          payment_ref:
            form.payMethod === "cod" ? undefined : form.trxid.trim().toUpperCase(),
          items: detail.map((l) => ({
            productId: l.product.id,
            variantLabel: l.variantLabel,
            qty: l.qty,
          })),
        }),
      });
    } catch {
      fail({
        bn: "সার্ভারে পৌঁছানো যাচ্ছে না — ইন্টারনেট চেক করে আবার চেষ্টা করুন।",
        en: "Could not reach the shop — check your connection and try again.",
      });
      return;
    }

    let body: unknown = null;
    try {
      body = await res.json();
    } catch {}
    const data = (body ?? {}) as {
      order?: Order;
      error?: string;
      errors?: { field: string; message: string }[];
      field?: string;
      smartCard?: { stamps: number; target: number; justCompleted: boolean };
    };

    if (res.ok && data.order) {
      persistAddress();
      const slotNote = deliverySlotSummary(
        {
          deliveryWindow: data.order.deliveryWindow ?? deliveryWindow,
          scheduledAt:
            data.order.scheduledAt ?? (scheduledAt ? new Date(scheduledAt).getTime() : null),
          isPickup: form.isPickup,
          pickupSlot: form.isPickup ? form.pickupSlot : null,
        },
        lang,
      );
      saveLastOrder({
        id: data.order.id,
        phone: form.phone,
        placedAt: Date.now(),
        total: data.order.total,
      });
      // Conversion (pixel/GA, only when configured) — once per order id.
      trackPurchaseOnce({
        type: "purchase",
        orderId: data.order.id,
        items: detail.map((l) => ({
          id: l.product.id,
          name: l.product.name,
          category: l.product.category,
          price: l.qty > 0 ? Math.round(l.lineTotal / l.qty) : l.product.price,
          qty: l.qty,
          shopId: l.product.shopId,
        })),
        value: data.order.total,
        delivery: data.order.deliveryCharge,
      });
      haptic("success");
      setPlaced({
        orderId: data.order.id,
        phone: form.phone,
        ordered: detail.map((l) => l.product),
        eta: form.isPickup
          ? `Ready in ${bagShop?.prepMinutes ?? 15} min`
          : isCourierZone(derivedZoneId)
            ? courierEta(lang)
            : (summary.breakdown?.eta ?? data.order.etaLabel),
        charge: data.order.deliveryCharge,
        total: data.order.total,
        addressSummary: form.isPickup
          ? `${SUNAMGANJ_HUB}, ${SUNAMGANJ_UPAZILA}`
          : fullAddress,
        deliveryCode: data.order.deliveryCode,
        payment: data.order.payment,
        isPickup: form.isPickup,
        isCourier: !form.isPickup && isCourierZone(derivedZoneId),
        cardFull: data.smartCard?.justCompleted ?? false,
        giftNote: giftCheck.value.isGift
          ? [
              t("gift.badge"),
              giftCheck.value.recipientName
                ? `for ${giftCheck.value.recipientName}`
                : null,
              giftCheck.value.wrap !== "none" ? `${giftCheck.value.wrap} wrap` : null,
            ]
              .filter((part): part is string => part !== null)
              .join(" · ")
          : undefined,
        smartCardNote: data.smartCard
          ? `স্মার্ট কার্ড: ${data.smartCard.stamps}/${data.smartCard.target} স্ট্যাম্প`
          : undefined,
        slotNote,
      });
      clearStoredRef();
      clear();
      return;
    }

    // Server said no — map every message to a field (P0 #6) and say it in Bangla.
    const fieldMap: Record<string, string> = {};
    for (const e of data.errors ?? []) {
      const f = fieldForServerError(e.field, e.message);
      if (f && !fieldMap[f]) fieldMap[f] = e.message;
    }
    if (data.field) {
      const f = fieldForServerError(data.field, data.error);
      if (f && !fieldMap[f]) fieldMap[f] = data.error ?? "";
    }
    const firstMessage = data.errors?.[0]?.message || data.error;
    const friendly = friendlyOrderError(firstMessage);
    const extra = (data.errors?.length ?? 0) - 1;
    fail(
      extra > 0 ? { ...friendly, bn: `${friendly.bn} (আরও ${extra}টি ঘর ঠিক করতে হবে)` } : friendly,
      Object.keys(fieldMap).length > 0 ? fieldMap : undefined,
    );
  };

  const inputClass = (field: string) =>
    `h-12 w-full rounded-2xl bg-paper px-4 text-sm text-ink ring-1 placeholder:text-ink-soft/50 focus:ring-2 focus:ring-forest-500 ${
      fieldErrors[field] ? "ring-rose-300 bg-rose-50/50" : "ring-line"
    }`;

  const firstBadField = firstErrorField(fieldErrors);
  const deliveryPromise = lang === "bn" ? DELIVERY_CHARGE_PROMISE_BN : DELIVERY_CHARGE_PROMISE_EN;
  // P1 #17 — outside the rider area the honest answer is days, not minutes.
  const etaLabel = form.isPickup
    ? `Ready in ${bagShop?.prepMinutes ?? 15} min`
    : isCourierZone(derivedZoneId)
      ? courierEta(lang)
      : (summary.breakdown?.eta ?? zone.etaLabel);
  const extrasBadge = [
    activeCoupon ? `${t("checkout.coupon")} ${activeCoupon.code} ✓` : null,
    giftValue.on ? t("gift.badge") : null,
    form.tipAmount > 0 ? `Tip ৳${form.tipAmount}` : null,
    referralCode.trim() ? `Ref ${referralCode.trim()}` : null,
    form.note.trim() ? "Note ✓" : null,
  ].filter((part): part is string => part !== null);
  const stickyHint =
    minOrderShortfall > 0
      ? t("checkout.minOrderHint")
          .replace("{amount}", formatBdt(minOrderShortfall))
          .replace("{min}", courierMinLabel)
      : orderError
        ? orderError.bn
        : `${t("checkout.delivery")} ${summary.freeDelivery ? "FREE" : formatBdt(summary.charge)} · ${etaLabel}`;

  const summaryCard = (compact: boolean) => (
    <OrderSummaryCard
      compact={compact}
      detail={detail}
      subtotal={subtotal}
      summary={summary}
      zone={zone}
      isPickup={form.isPickup}
      activeCoupon={activeCoupon}
      bagOffer={bagOffer}
      giftWrap={giftValue.wrap}
      plusState={plusState}
      bagShopPrep={bagShop?.prepMinutes ?? 15}
    />
  );

  return (
    <div className="grid gap-12 lg:grid-cols-[1fr_400px]">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          placeOrder();
        }}
        className="min-w-0 space-y-6 pb-24 lg:pb-0"
        noValidate
      >
        <CheckoutProgress
          current={currentStep}
          labels={[t("checkout.step1"), t("checkout.step2"), t("checkout.step3")]}
          stepOf={t("checkout.stepOf")}
          onJump={jumpToStep}
        />

        {/* One delivery promise — the same sentence the bag showed */}
        <div className="rounded-2xl bg-gradient-to-r from-forest-800 to-forest-900 p-4 text-ivory-50 ring-1 ring-forest-700">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gold-400 text-forest-900">
              <IconTruck className="h-4 w-4" />
            </span>
            <div className="flex-1">
              <p className="flex items-center gap-1.5 text-sm font-bold" data-testid="delivery-promise">
                <IconTruck className="h-4 w-4 shrink-0" /> {deliveryPromise}
              </p>
              <p className="mt-0.5 text-xs text-ivory-100/80">
                {DELIVERY_CHARGE_LADDER_BN} · স্টোর পিকআপ ফ্রি
              </p>
            </div>
          </div>
        </div>

        {/* ---------------------------------------------------------- */}
        {/* ① আপনার তথ্য                                               */}
        {/* ---------------------------------------------------------- */}
        <StepSection
          id="checkout-step-1"
          n={1}
          title={t("checkout.step1")}
          hint="নাম, মোবাইল ও ঠিকানা — রাইডার এই তথ্যেই পৌঁছাবে।"
          done={step1Done}
        >
          {/* Saved addresses + geolocate */}
          <div className="mb-5 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleGeolocate}
              disabled={geoLoading}
              className="inline-flex items-center gap-1.5 rounded-full bg-paper px-4 py-2 text-xs font-medium ring-1 ring-line hover:bg-ivory-100"
            >
              <IconMapPin className="h-3.5 w-3.5" />
              {geoLoading ? "লোকেশন খুঁজছি…" : "আমার লোকেশন ব্যবহার করুন"}
            </button>
            {savedAddrs.length > 0 && (
              <button
                type="button"
                onClick={() => setShowSaved(!showSaved)}
                className="inline-flex items-center gap-1.5 rounded-full bg-paper px-4 py-2 text-xs font-medium ring-1 ring-line hover:bg-ivory-100"
              >
                📚 সেভ করা ঠিকানা ({savedAddrs.length})
              </button>
            )}
          </div>
          {geoNote ? (
            <p role="status" className="mb-4 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900 ring-1 ring-amber-200">
              {geoNote}
            </p>
          ) : null}
          {prefilledFrom ? (
            <div
              role="status"
              data-testid="address-prefilled"
              className="mb-4 rounded-xl bg-forest-50 px-3 py-2 text-xs leading-5 text-forest-900 ring-1 ring-forest-200"
            >
              <p className="flex items-start gap-2">
                <IconCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  {prefilledFrom.label} — {t("checkout.savedAddressUsed")}
                </span>
              </p>
              {/* UX plan §6 — the repeat customer's one tap: nothing to retype,
                  jump straight to the review step and the Place Order button.
                  It never submits by itself. */}
              <button
                type="button"
                data-testid="same-as-last"
                onClick={() => {
                  jumpToStep(3);
                  ctaRef.current?.focus({ preventScroll: true });
                }}
                className="tap-press mt-2 inline-flex min-h-[44px] items-center gap-1.5 rounded-full bg-forest-800 px-4 text-xs font-semibold text-ivory-50 transition-colors hover:bg-forest-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest-500 focus-visible:ring-offset-2"
              >
                {t("checkout.sameAsLast")}
                <IconArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : null}
          {showSaved && savedAddrs.length > 0 && (
            <div className="mb-5 rounded-2xl bg-ivory-50 p-4 ring-1 ring-line">
              <p className="mb-3 text-xs font-bold uppercase tracking-wider text-ink-soft">সেভ করা ঠিকানা</p>
              <div className="space-y-2">
                {savedAddrs.map((addr) => (
                  <div key={addr.id} className="flex items-center justify-between rounded-xl bg-paper px-3 py-2.5 ring-1 ring-line">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink">{addr.label} — {addr.area}</p>
                      <p className="truncate text-xs text-ink-soft">{addr.houseNo} {addr.roadName} {addr.fullAddress}</p>
                    </div>
                    <div className="ml-3 flex shrink-0 gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleUseSaved(addr)}
                        className="rounded-full bg-forest-800 px-3 py-1 text-xs font-semibold text-white"
                      >
                        ব্যবহার করুন
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          deleteAddress(addr.id);
                          setSavedAddrs(getSavedAddresses());
                        }}
                        aria-label="ঠিকানা মুছুন"
                        className="rounded-full bg-paper px-2.5 py-1 text-xs ring-1 ring-line"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-ink">
                মোবাইল নম্বর / Mobile number <span className="text-rose-600">*</span>
              </span>
              <input
                ref={phoneRef}
                required
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={form.phone}
                onChange={(e) => {
                  update("phone", tidyPhoneInput(e.target.value));
                  clearFieldError("phone");
                }}
                placeholder="017XXXXXXXX"
                aria-invalid={!!fieldErrors.phone}
                aria-describedby={fieldErrors.phone ? "err-phone" : undefined}
                className={inputClass("phone")}
              />
              {fieldErrors.phone ? (
                <p id="err-phone" className="mt-1.5 text-xs text-rose-700">{fieldErrors.phone}</p>
              ) : (
                <p className="mt-1 text-[11px] text-ink-soft">
                  {t("checkout.phoneHint")}
                </p>
              )}
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-ink">
                আপনার নাম / Full name <span className="text-rose-600">*</span>
              </span>
              <input
                ref={nameRef}
                required
                autoComplete="name"
                value={form.name}
                onChange={(e) => {
                  update("name", e.target.value);
                  clearFieldError("name");
                }}
                placeholder="যেমন: রাহাত আহমেদ / Rahat Ahmed"
                aria-invalid={!!fieldErrors.name}
                aria-describedby={fieldErrors.name ? "err-name" : undefined}
                className={inputClass("name")}
              />
              {fieldErrors.name && (
                <p id="err-name" className="mt-1.5 text-xs text-rose-700">{fieldErrors.name}</p>
              )}
            </label>
          </div>

          {/* Smart Card — account-gated stamps (signup needs no verification) */}
          {cardChecked && (
            <div
              className="mt-3 rounded-2xl border border-gold-300 bg-gold-50/70 px-4 py-3 text-xs leading-6 text-ink-soft sm:text-sm"
              data-testid="smart-card-strip"
            >
              {!cardCustomer ? (
                <>
                  <IconGift className="mr-1 inline h-4 w-4 align-[-3px] text-gold-600" />{" "}
                  <strong className="text-forest-900">স্মার্ট কার্ড:</strong> প্রতি অর্ডারে ১টি স্ট্যাম্প — ১০টি পূর্ণ হলে আকর্ষণীয় পুরস্কার ফ্রি। স্ট্যাম্প জমাতে{" "}
                  <Link href="/account?next=/checkout" className="font-semibold text-forest-800 underline underline-offset-2">
                    ফ্রি অ্যাকাউন্ট খুলুন
                  </Link>{" "}
                  — কোনো ভেরিফিকেশন লাগে না, সাইন আপ করলেই সাথে সাথে লগ ইন।
                </>
              ) : smartCard ? (
                <>
                  <IconGift className="mr-1 inline h-4 w-4 align-[-3px] text-gold-600" />{" "}
                  <strong className="text-forest-900">স্মার্ট কার্ড:</strong> {smartCard.stamps}/{smartCard.target} স্ট্যাম্প — এই অর্ডারের পরে {smartCard.afterOrderStamps}/{smartCard.target} হবে।{" "}
                  {smartCard.revealed
                    ? `পুরস্কার: ${smartCard.rewardTitle}`
                    : "পুরস্কার সারপ্রাইজ — প্রথম অর্ডারের পরেই দেখা যাবে!"}
                </>
              ) : (
                <>
                  <IconGift className="mr-1 inline h-4 w-4 align-[-3px] text-gold-600" /> স্মার্ট কার্ড লোড হচ্ছে…
                </>
              )}
            </div>
          )}

          {/* District / Upazila / Para — the simple address ladder */}
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-ink">
                জেলা / District <span className="text-rose-600">*</span>
              </span>
              <select
                required
                autoComplete="address-level1"
                value={form.district}
                onChange={(e) => {
                  update("district", e.target.value);
                  if (isSunamganjDistrict(e.target.value)) {
                    update("upazila", SUNAMGANJ_UPAZILA);
                  }
                }}
                className={inputClass("district")}
              >
                {DISTRICTS.map((d) => (
                  <option key={d.en} value={d.en}>
                    {d.bn} — {d.en}
                  </option>
                ))}
              </select>
              {!sunamganjDistrict && (
                <p className="mt-1 text-[11px] text-amber-700">
                  অন্য জেলায় কুরিয়ারে পাঠানো হয় — চার্জ ৳১৫০, ন্যূনতম অর্ডার {courierMinLabel}।
                </p>
              )}
            </label>

            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-ink">
                উপজেলা / Upazila <span className="text-rose-600">*</span>
              </span>
              {(() => {
                const otherUz = getUpazilasForDistrict(form.district);
                if (sunamganjDistrict) {
                  return (
                    <select
                      required
                      value={form.upazila}
                      onChange={(e) => {
                        update("upazila", e.target.value);
                        update("paraSelected", "");
                        update("paraCustom", "");
                      }}
                      className={inputClass("upazila")}
                    >
                      {SUNAMGANJ_UPAZILAS.map((u) => (
                        <option key={u.en} value={u.en}>
                          {u.bn} — {u.en}
                        </option>
                      ))}
                    </select>
                  );
                }
                if (otherUz.length > 0) {
                  return (
                    <select
                      required
                      value={form.upazilaCustom}
                      onChange={(e) => {
                        update("upazilaCustom", e.target.value);
                        update("paraSelected", "");
                        update("paraCustom", "");
                      }}
                      className={inputClass("upazila")}
                    >
                      <option value="" disabled>
                        — উপজেলা সিলেক্ট করুন —
                      </option>
                      {otherUz.map((u) => (
                        <option key={u} value={u}>{u}</option>
                      ))}
                    </select>
                  );
                }
                return (
                  <input
                    required
                    value={form.upazilaCustom}
                    onChange={(e) => {
                      update("upazilaCustom", e.target.value);
                      update("paraSelected", "");
                    }}
                    placeholder="উপজেলার নাম লিখুন"
                    className={inputClass("upazila")}
                  />
                );
              })()}
            </label>
          </div>

          <div className="mt-4">
            <span className="mb-2 block text-sm font-medium text-ink">
              পাড়া / গ্রাম / Para or Village <span className="text-rose-600">*</span>
            </span>
            <input
              ref={paraRef}
              required
              autoComplete="address-level3"
              value={form.paraCustom}
              onChange={(e) => {
                update("paraCustom", e.target.value);
                update("paraSelected", PARA_CUSTOM);
                clearFieldError("area");
              }}
              placeholder="আপনার পাড়া / গ্রামের নাম লিখুন"
              aria-label="পাড়া বা গ্রামের নাম"
              aria-invalid={!!fieldErrors.area}
              className={inputClass("area")}
            />
            {fieldErrors.area ? (
              <p className="mt-1.5 text-xs text-rose-700">{fieldErrors.area}</p>
            ) : (
              <p className="mt-1.5 text-xs text-ink-soft">
                পাড়া বা গ্রামের নাম লিখলেই ডেলিভারি চার্জ ও সময় দেখা যাবে।
              </p>
            )}
          </div>

          {/* House / Road structured fields */}
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-ink">
                বাড়ির নম্বর / House No. <span className="font-normal text-ink-soft">(ঐচ্ছিক)</span>
              </span>
              <input
                value={form.houseNo}
                onChange={(e) => update("houseNo", e.target.value)}
                autoComplete="address-line1"
                placeholder="যেমন: 12/A, Holding 45"
                className="h-12 w-full rounded-2xl bg-paper px-4 text-sm text-ink ring-1 ring-line placeholder:text-ink-soft/50 focus:ring-2 focus:ring-forest-500"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-ink">
                রোডের নাম / Road Name <span className="font-normal text-ink-soft">(ঐচ্ছিক)</span>
              </span>
              <input
                list="prosanti-roads"
                value={form.roadName}
                onChange={(e) => update("roadName", e.target.value)}
                autoComplete="address-line2"
                placeholder="যেমন: College Road, Hospital Road"
                className="h-12 w-full rounded-2xl bg-paper px-4 text-sm text-ink ring-1 ring-line placeholder:text-ink-soft/50 focus:ring-2 focus:ring-forest-500"
              />
              <datalist id="prosanti-roads">
                {ROAD_NAMES.map((r) => (
                  <option key={r} value={r} />
                ))}
              </datalist>
            </label>
          </div>

          <label className="mt-4 block">
            <span className="mb-1.5 block text-sm font-medium text-ink">
              বিস্তারিত ঠিকানা / Full address <span className="text-rose-600">*</span>
            </span>
            <textarea
              ref={addressRef}
              required={!form.isPickup}
              rows={3}
              autoComplete="street-address"
              value={form.address}
              onChange={(e) => {
                update("address", e.target.value);
                clearFieldError("address");
              }}
              placeholder="বাসা নম্বর, রোড, ল্যান্ডমার্ক, ফ্লোর — যেমন: House 12, College Road, 2nd floor, Mosque-এর পাশে"
              aria-invalid={!!fieldErrors.address}
              aria-describedby={fieldErrors.address ? "err-address" : "hint-full-address"}
              className={`w-full rounded-2xl bg-paper px-4 py-3 text-sm text-ink ring-1 placeholder:text-ink-soft/50 focus:ring-2 focus:ring-forest-500 ${
                fieldErrors.address ? "ring-rose-300 bg-rose-50/50" : "ring-line"
              }`}
            />
            {fieldErrors.address ? (
              <p id="err-address" className="mt-1.5 text-xs text-rose-700">{fieldErrors.address}</p>
            ) : (
              <p id="hint-full-address" className="mt-1.5 text-[11px] text-ink-soft">
                জেলা: {form.district} · উপজেলা: {effectiveUpazila || "—"} · পাড়া:{" "}
                {effectivePara || "—"} — এই তিনটি অটো যোগ হয়ে যাবে।
              </p>
            )}
          </label>

          {/* Map Pin Picker - Sunamganj real geo */}
          <div className="mt-5">
            <div className="flex items-center justify-between gap-3">
              <span className="block text-sm font-medium text-ink">
                <IconMapPin className="mr-1 inline h-4 w-4 align-[-3px]" /> ম্যাপে বাড়ি পিন করুন{" "}
                <span className="font-normal text-ink-soft">(ঐচ্ছিক — রাইডার সহজে খুঁজে পাবে)</span>
              </span>
              <button
                type="button"
                onClick={() => setShowMap((v) => !v)}
                className="shrink-0 rounded-full bg-paper px-3 py-1.5 text-xs font-semibold text-forest-900 ring-1 ring-line hover:bg-ivory-100"
              >
                {showMap ? "ম্যাপ লুকান" : "ম্যাপ দেখুন"}
              </button>
            </div>
            {showMap && (
              <div className="mt-3">
                <MapPinPicker
                  value={pinPos}
                  onChange={(pos) => setPinPos(pos)}
                />
              </div>
            )}
            {pinPos && (
              <p className="mt-2 text-xs font-medium text-forest-700">
                📌 Pin: {pinPos.lat.toFixed(5)}, {pinPos.lng.toFixed(5)} · {distanceFromHubKm(pinPos).toFixed(2)} km from {SUNAMGANJ_HUB} · {findZoneByDistance(pinPos).name}
              </p>
            )}
          </div>
        </StepSection>

        {/* ---------------------------------------------------------- */}
        {/* ② ডেলিভারি ও পেমেন্ট                                         */}
        {/* ---------------------------------------------------------- */}
        <div ref={step2Ref} className="scroll-mt-28">
          <StepSection
            id="checkout-step-2"
            n={2}
            title={t("checkout.step2")}
            hint="কীভাবে ও কখন পাবেন, আর কীভাবে টাকা দেবেন।"
            done={step2Done}
          >
            {/* Home delivery vs store pickup — no longer a buried checkbox */}
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Delivery method">
              {(
                [
                  { pickup: false, icon: <IconTruck className="h-4 w-4" />, label: "হোম ডেলিভারি", sub: summary.freeDelivery ? "FREE" : formatBdt(summary.charge) },
                  { pickup: true, icon: <IconStore className="h-4 w-4" />, label: "স্টোর পিকআপ", sub: `${SUNAMGANJ_HUB} · ফ্রি` },
                ] as const
              ).map((opt) => {
                const active = form.isPickup === opt.pickup;
                return (
                  <button
                    key={String(opt.pickup)}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => update("isPickup", opt.pickup)}
                    className={`rounded-2xl px-3 py-3 text-left ring-1 transition-colors ${
                      active
                        ? "bg-forest-800 text-ivory-50 ring-forest-700"
                        : "bg-paper text-ink ring-line hover:bg-ivory-100"
                    }`}
                  >
                    <span className="flex items-center justify-center gap-1.5 text-sm font-semibold">{opt.icon} {opt.label}</span>
                    <span className={`mt-0.5 block text-[11px] ${active ? "text-ivory-100/70" : "text-ink-soft"}`}>{opt.sub}</span>
                  </button>
                );
              })}
            </div>

            {form.isPickup ? (
              <div className="mt-4 rounded-2xl bg-sky-50 p-4 ring-1 ring-sky-200">
                <p className="text-xs font-semibold text-sky-900">
                  পিকআপ সময় — {SUNAMGANJ_HUB}, {SUNAMGANJ_UPAZILA}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {["now", "9-11", "11-1", "2-4", "4-6", "6-8"].map((slot) => (
                    <button
                      key={slot}
                      type="button"
                      onClick={() => update("pickupSlot", slot)}
                      className={`rounded-full px-3 py-1.5 text-xs ring-1 ${form.pickupSlot === slot ? "bg-forest-800 text-white ring-forest-700" : "bg-paper ring-line"}`}
                    >
                      {slot === "now"
                        ? `এখনই (${bagShop?.prepMinutes ?? 15} মিনিট)`
                        : DELIVERY_SLOT_LABELS[slot as DeliverySlotKey][lang]}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="mt-4">
                <span className="mb-2 block text-sm font-medium text-ink">ডেলিভারি সময় / Delivery slot</span>
                <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Delivery slot">
                  {[
                    { id: "now" as TimeSlot, label: "এখনই", sub: etaLabel, icon: <IconBolt className="h-4 w-4" /> },
                    { id: "evening" as TimeSlot, label: "সন্ধ্যায়", sub: eveningSlotHint(nowMs, lang), icon: <IconMoon className="h-4 w-4" /> },
                    { id: "scheduled" as TimeSlot, label: "শিডিউল", sub: "দিন ও সময় বাছুন", icon: <IconCalendar className="h-4 w-4" /> },
                  ].map((slot) => (
                    <button
                      key={slot.id}
                      type="button"
                      role="radio"
                      aria-checked={form.timeSlot === slot.id}
                      data-testid={`slot-${slot.id}`}
                      onClick={() => {
                        update("timeSlot", slot.id);
                        clearFieldError("timeSlot");
                      }}
                      className={`rounded-2xl px-3 py-3 text-left ring-1 transition-colors ${
                        form.timeSlot === slot.id
                          ? "bg-forest-800 text-ivory-50 ring-forest-700"
                          : "bg-paper text-ink ring-line hover:bg-ivory-100"
                      }`}
                    >
                      <span className="flex items-center gap-1.5 text-sm">{slot.icon} {slot.label}</span>
                      <span className={`mt-0.5 block text-[11px] ${form.timeSlot === slot.id ? "text-ivory-100/70" : "text-ink-soft"}`}>{slot.sub}</span>
                    </button>
                  ))}
                </div>
                {fieldErrors.timeSlot ? (
                  <p className="mt-1.5 text-xs text-rose-700">{fieldErrors.timeSlot}</p>
                ) : null}
                {form.timeSlot === "evening" && (
                  <p className="mt-2 text-xs text-ink-soft" data-testid="evening-note">
                    <IconMoon className="mr-1 inline h-4 w-4 align-[-3px]" /> দোকান ও রাইডার সন্ধ্যা ৬–৯টার মধ্যে পৌঁছে দেওয়ার জন্য প্ল্যান করবে।
                  </p>
                )}
                {form.timeSlot === "scheduled" && (
                  <div className="mt-3 space-y-3 rounded-2xl bg-ivory-50 p-4 ring-1 ring-line">
                    <div className="grid grid-cols-2 gap-3">
                      <label className="block">
                        <span className="mb-1 block text-xs font-medium text-ink">তারিখ / Date</span>
                        <input
                          type="date"
                          value={form.deliveryDate}
                          min={MIN_DELIVERY_DATE}
                          max={MAX_DELIVERY_DATE}
                          onChange={(e) => update("deliveryDate", e.target.value)}
                          className="h-10 w-full rounded-xl bg-paper px-3 text-sm ring-1 ring-line"
                        />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-xs font-medium text-ink">সময় / Time window</span>
                        <select
                          value={form.deliveryWindow}
                          onChange={(e) => update("deliveryWindow", e.target.value as DeliveryWindow)}
                          className="h-10 w-full rounded-xl bg-paper px-3 text-sm ring-1 ring-line"
                        >
                          {SCHEDULE_WINDOWS.map((w) => (
                            <option key={w} value={w}>{DELIVERY_SLOT_LABELS[w][lang]}</option>
                          ))}
                          {settings.expressDeliveryEnabled && (
                            <option value="express">{DELIVERY_SLOT_LABELS.express[lang]} (+৳40)</option>
                          )}
                        </select>
                      </label>
                    </div>
                    <p className="text-[11px] text-ink-soft">
                      শিডিউল: {form.deliveryDate} · {DELIVERY_SLOT_LABELS[form.deliveryWindow][lang]} — দোকান সেভাবে প্রস্তুত করবে।
                      {form.deliveryWindow === "express" && ` Express adds ${formatBdt(4000)}.`}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Delivery estimate — dynamic */}
            <div className="mt-5 flex items-start gap-4 rounded-2xl bg-forest-900 p-5 text-ivory-100">
              <IconTruck className="mt-0.5 h-6 w-6 shrink-0 text-gold-300" />
              <div className="flex-1 text-sm leading-6">
                <p className="font-semibold">
                  {form.isPickup ? `Pickup — ${SUNAMGANJ_HUB}` : zone.name}
                  {summary.distanceKm ? ` · ${summary.distanceKm.toFixed(2)}km from ${SUNAMGANJ_HUB}` : ""}
                </p>
                <p className="mt-1 text-ivory-100/70">
                  {summary.isOutside && !form.isPickup ? (
                    <>
                      <IconTruck className="mr-1 inline h-4 w-4 align-[-3px]" /> {t("purchase.courierTitle")} — কনফার্মেশনের পর{" "}
                      <strong className="text-gold-300" data-testid="courier-eta">{etaLabel}</strong>{" "}
                    </>
                  ) : (
                    <>
                      {INSTANT_DELIVERY_TITLE} — কনফার্মেশনের পর{" "}
                      <strong className="text-gold-300">{etaLabel}</strong>{" "}
                    </>
                  )}
                  · ডেলিভারি চার্জ{" "}
                  <strong data-testid="delivery-charge">
                    {summary.freeDelivery ? (
                      <span className="text-gold-300">
                        {summary.couponFree
                          ? "FREE — Coupon"
                          : summary.plusFree
                            ? "FREE — PROSANTI+"
                            : form.isPickup
                              ? "FREE — Pickup"
                              : summary.thresholdFree === "shop"
                                ? t("freeDelivery.freeLine").replace("{by}", t("freeDelivery.byShop"))
                                : summary.thresholdFree === "platform"
                                  ? t("freeDelivery.freeLine").replace("{by}", t("freeDelivery.byPlatform"))
                                  : "Free"}
                      </span>
                    ) : (
                      formatBdt(summary.charge)
                    )}
                  </strong>
                  {summary.breakdown && summary.breakdown.surcharge.total > 0 && !summary.freeDelivery && (
                    <span className="mt-1 block text-xs text-amber-200">
                      Delivery {formatBdt(summary.fullCharge)}
                      {summary.breakdown.surcharge.night > 0 && ` + Night ${formatBdt(summary.breakdown.surcharge.night)}`}
                      {summary.breakdown.surcharge.rain > 0 && ` + Rain ${formatBdt(summary.breakdown.surcharge.rain)}`}
                      {summary.breakdown.surcharge.express > 0 && ` + Express ${formatBdt(summary.breakdown.surcharge.express)}`}
                      {summary.breakdown.surcharge.weight > 0 && ` + Weight ${formatBdt(summary.breakdown.surcharge.weight)}`}
                    </span>
                  )}
                  {summary.isOutside && !form.isPickup && (
                    <span className="mt-1 block text-xs text-amber-200">
                      সুনামগঞ্জ সদরের বাইরে — কুরিয়ার ডেলিভারি, ন্যূনতম {courierMinLabel} অর্ডার।
                    </span>
                  )}
                  {summary.isNight && !summary.freeDelivery && (
                    <span className="mt-1 block text-xs text-gold-300"><IconMoon className="mr-1 inline h-3.5 w-3.5 align-[-2px]" /> Night surcharge +{formatBdt(NIGHT_SURCHARGE_PAISA)} (9PM-6AM)</span>
                  )}
                  {summary.isRain && !summary.freeDelivery && (
                    <span className="mt-1 block text-xs text-sky-300">🌧️ Rain surcharge +{formatBdt(RAIN_SURCHARGE_PAISA)}</span>
                  )}
                </p>
              </div>
            </div>

            {/* Payment — P1 #8: COD by default; the shop's own bKash/Nagad
                wallet only appears once a number is configured. */}
            <h3 className="mt-6 text-sm font-semibold text-ink">{t("checkout.paymentMethod")}</h3>
            <div className="mt-3 space-y-3">
              <label
                className={`flex cursor-pointer items-center gap-4 rounded-2xl p-4 ring-1 transition-colors sm:p-5 ${
                  form.payMethod === "cod"
                    ? "border border-forest-600 bg-forest-50"
                    : "bg-paper ring-line hover:bg-ivory-50"
                }`}
              >
                <input
                  type="radio"
                  name="payment"
                  value="cod"
                  checked={form.payMethod === "cod"}
                  onChange={() => {
                    update("payMethod", "cod");
                    clearFieldError("payMethod");
                  }}
                  className="h-4 w-4 accent-forest-700"
                />
                <span className="flex-1">
                  <span className="block text-sm font-semibold text-ink">
                    ক্যাশ অন ডেলিভারি / {t("checkout.cashOnDelivery")}
                  </span>
                  <span className="mt-0.5 block text-xs leading-5 text-ink-soft">
                    পার্সেল হাতে পেয়ে টাকা পরিশোধ করবেন।
                  </span>
                </span>
                <span className="rounded-full bg-ivory-100 px-3 py-1 text-xs font-semibold text-forest-800 ring-1 ring-line">
                  {t("checkout.primary")}
                </span>
              </label>
              {wallets?.bkash ? (
                <label
                  className={`flex cursor-pointer items-center gap-4 rounded-2xl p-4 ring-1 transition-colors sm:p-5 ${
                    form.payMethod === "bkash"
                      ? "border border-[#e2136e] bg-[#fdf2f8]"
                      : "bg-paper ring-line hover:bg-ivory-50"
                  }`}
                >
                  <input
                    type="radio"
                    name="payment"
                    value="bkash"
                    checked={form.payMethod === "bkash"}
                    onChange={() => update("payMethod", "bkash")}
                    className="h-4 w-4 accent-[#e2136e]"
                  />
                  <span className="flex-1">
                    <span className="block text-sm font-semibold text-ink">bKash</span>
                    <span className="mt-0.5 block text-xs leading-5 text-ink-soft">
                      আমাদের bKash নম্বরে টাকা পাঠিয়ে TRXID দিন — দোকান ভেরিফাই করবে।
                    </span>
                  </span>
                </label>
              ) : null}
              {wallets?.nagad ? (
                <label
                  className={`flex cursor-pointer items-center gap-4 rounded-2xl p-4 ring-1 transition-colors sm:p-5 ${
                    form.payMethod === "nagad"
                      ? "border border-[#f6921e] bg-[#fff8f0]"
                      : "bg-paper ring-line hover:bg-ivory-50"
                  }`}
                >
                  <input
                    type="radio"
                    name="payment"
                    value="nagad"
                    checked={form.payMethod === "nagad"}
                    onChange={() => update("payMethod", "nagad")}
                    className="h-4 w-4 accent-[#f6921e]"
                  />
                  <span className="flex-1">
                    <span className="block text-sm font-semibold text-ink">Nagad</span>
                    <span className="mt-0.5 block text-xs leading-5 text-ink-soft">
                      আমাদের Nagad নম্বরে টাকা পাঠিয়ে TRXID দিন — দোকান ভেরিফাই করবে।
                    </span>
                  </span>
                </label>
              ) : null}
              {form.payMethod !== "cod" && wallets?.[form.payMethod] && (
                <WalletPaySteps
                  method={form.payMethod}
                  number={wallets[form.payMethod] as string}
                  amount={summary.total}
                  trxid={form.trxid}
                  error={fieldErrors.trxid}
                  inputRef={trxidRef}
                  inputClassName={inputClass("trxid")}
                  onTrxid={(v) => {
                    update("trxid", v);
                    clearFieldError("trxid");
                  }}
                />
              )}
              {fieldErrors.payMethod && (
                <p className="text-xs text-rose-700">{fieldErrors.payMethod}</p>
              )}
            </div>
          </StepSection>
        </div>

        {/* ---------------------------------------------------------- */}
        {/* আরও অপশন — gift · referral · tip · coupon · label · note     */}
        {/* ---------------------------------------------------------- */}
        <MoreOptions
          open={moreOpen}
          onToggle={setMoreOpen}
          title={t("checkout.moreOptions")}
          hint={t("checkout.moreOptionsHint")}
          badge={extrasBadge.length > 0 ? extrasBadge.join(" · ") : null}
        >
          {/* Promo / coupon code — lives WITH the order */}
          <div>
            <h3 className="text-sm font-semibold text-ink">{t("checkout.haveCoupon")}</h3>
            <div className="mt-2 max-w-md">
              {activeCoupon ? (
                <div
                  className="flex items-center justify-between rounded-2xl bg-forest-50 px-4 py-3.5 text-sm ring-1 ring-forest-200"
                  data-testid="coupon-applied"
                >
                  <span className="flex items-center gap-2">
                    <IconGift className="h-4 w-4 text-forest-700" />
                    <span className="font-mono font-bold text-forest-800">
                      {activeCoupon.code}
                    </span>
                    <span className="text-xs text-forest-700">
                      প্রয়োগ হয়েছে ✓
                      {summary.discount > 0 ? ` · −${formatBdt(summary.discount)}` : summary.couponFree ? " · ফ্রি ডেলিভারি" : ""}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={removeCoupon}
                    className="text-xs font-semibold text-ink-soft underline underline-offset-2 hover:text-rose-700"
                  >
                    {t("checkout.remove")}
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex gap-2">
                    <input
                      ref={couponRef}
                      value={form.couponCode}
                      onChange={(e) => {
                        update("couponCode", e.target.value.toUpperCase());
                        clearFieldError("couponCode");
                      }}
                      onKeyDown={(e) =>
                        e.key === "Enter" && (e.preventDefault(), applyCoupon())
                      }
                      placeholder="Coupon code"
                      aria-label="Coupon code"
                      aria-invalid={!!fieldErrors.couponCode}
                      className={`h-12 w-full min-w-0 rounded-2xl bg-paper px-4 text-sm uppercase tracking-wide text-ink ring-1 placeholder:normal-case placeholder:tracking-normal placeholder:text-ink-soft/50 focus:ring-2 focus:ring-forest-500 ${
                        fieldErrors.couponCode ? "ring-rose-300 bg-rose-50/50" : "ring-line"
                      }`}
                    />
                    <button
                      type="button"
                      onClick={applyCoupon}
                      className="shrink-0 rounded-2xl bg-forest-800 px-6 text-sm font-semibold text-ivory-50 transition-colors hover:bg-forest-700"
                    >
                      {t("checkout.apply")}
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={applyBestCoupon}
                    disabled={bestLoading}
                    className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-forest-700 underline underline-offset-2 hover:text-forest-900 disabled:opacity-60"
                  >
                    <IconSparkles className="h-3.5 w-3.5" />
                    {bestLoading ? "সেরা অফার খুঁজছে…" : "সেরা অফার অটো-অ্যাপ্লাই করুন"}
                  </button>
                </>
              )}
              {couponCheck.problem && (
                <p role="status" className="mt-2 text-xs leading-5 text-rose-700">
                  {friendlyOrderError(couponCheck.problem).bn}
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
              {fieldErrors.couponCode && (
                <p className="mt-2 text-xs text-rose-700">{fieldErrors.couponCode}</p>
              )}
            </div>
          </div>

          {/* Gift + referral */}
          <div ref={giftWrapRef}>
            <GiftStep
              value={giftValue}
              onChange={setGiftValue}
              errors={giftCheck.ok
                ? undefined
                : (giftCheck.errors as Record<string, string>)}
            />
            {fieldErrors.gift && (
              <p className="mt-2 text-xs text-rose-700">{fieldErrors.gift}</p>
            )}
          </div>
          {settings.referral.enabled ? (
            <div ref={referralWrapRef} className="rounded-2xl border border-line bg-paper p-5">
              <ReferralField
                value={referralCode}
                onChange={setReferralCode}
                error={fieldErrors.referralCode}
              />
              {referralCode.trim() === "" ? (
                <p className="mt-2 text-xs text-ink-soft">
                  {t("referral.yourCode")} ·{" "}
                  <Link href="/account" className="underline underline-offset-2">
                    {referralLink("", "PS-XXXXXX")}
                  </Link>
                </p>
              ) : null}
            </div>
          ) : null}

          {/* Tip */}
          {!form.isPickup && (
            <div>
              <p className="text-sm font-semibold text-ink">💝 রাইডারকে টিপ <span className="font-normal text-ink-soft">(ঐচ্ছিক — পুরোটা রাইডার পায়)</span></p>
              <div className="mt-2 flex flex-wrap gap-2">
                {[0, 10, 20, 30, 50].map((tip) => (
                  <button
                    key={tip}
                    type="button"
                    aria-pressed={form.tipAmount === tip}
                    onClick={() => update("tipAmount", tip)}
                    className={`rounded-full px-4 py-2 text-xs font-semibold ring-1 ${form.tipAmount === tip ? "bg-forest-800 text-white ring-forest-700" : "bg-paper text-ink ring-line"}`}
                  >
                    {tip === 0 ? "টিপ নয়" : `৳${tip}`}
                  </button>
                ))}
              </div>
              {form.tipAmount > 0 && (
                <p className="mt-2 text-xs text-forest-700">ধন্যবাদ! ৳{form.tipAmount} আপনার রাইডার পাবে।</p>
              )}
            </div>
          )}

          {/* Saved-address label (optional) — tagged for one-tap reuse */}
          <div>
            <span className="mb-1.5 block text-sm font-semibold text-ink">
              এই ঠিকানার লেবেল <span className="font-normal text-ink-soft">(ঐচ্ছিক — অর্ডারের পর সেভ হয়)</span>
            </span>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  { id: "home", label: "বাসা / Home", icon: <IconHome className="h-3.5 w-3.5" /> },
                  { id: "office", label: "অফিস / Office", icon: <IconBriefcase className="h-3.5 w-3.5" /> },
                  { id: "other", label: "অন্যান্য / Other", icon: <IconMapPin className="h-3.5 w-3.5" /> },
                ] as const
              ).map((tag) => (
                <button
                  key={tag.id}
                  type="button"
                  aria-pressed={addrTag === tag.id}
                  onClick={() => setAddrTag(tag.id)}
                  className={`rounded-full px-4 py-2 text-xs font-medium ring-1 transition-colors ${
                    addrTag === tag.id
                      ? "bg-forest-800 text-ivory-50 ring-forest-700"
                      : "bg-paper text-ink ring-line hover:bg-ivory-100"
                  }`}
                >
                  <span className="flex items-center justify-center gap-1.5">
                    {tag.icon} {tag.label}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold text-ink">
              অর্ডার নোট <span className="font-normal text-ink-soft">({t("checkout.optional")})</span>
            </span>
            <input
              value={form.note}
              onChange={(e) => update("note", e.target.value)}
              placeholder="যেমন: ডেলিভারির আগে কল করবেন"
              className="h-12 w-full rounded-2xl bg-paper px-4 text-sm text-ink ring-1 ring-line placeholder:text-ink-soft/50 focus:ring-2 focus:ring-forest-500"
            />
          </label>
        </MoreOptions>

        {/* ---------------------------------------------------------- */}
        {/* ③ দেখে নিন ও অর্ডার করুন                                     */}
        {/* ---------------------------------------------------------- */}
        <div ref={reviewRef} className="scroll-mt-28">
          <StepSection
            id="checkout-step-3"
            n={3}
            title={t("checkout.step3")}
            hint="একবার চোখ বুলিয়ে নিন — তারপর এক ট্যাপে অর্ডার।"
          >
            {/* The summary card on phones lives HERE, in the step; desktop keeps the aside. */}
            <div className="lg:hidden">{summaryCard(true)}</div>

            <div className="space-y-3 lg:space-y-3">
              {mixedBag && (
                <p role="alert" className="rounded-2xl bg-amber-50 px-5 py-4 text-sm leading-6 text-amber-900 ring-1 ring-amber-200">
                  ব্যাগে {lineShopIds(detail, shops[0]?.id ?? "").length}টি আলাদা দোকানের পণ্য আছে — একটি অর্ডার একটি দোকান থেকেই হয়। দোকান আলাদা করে অর্ডার করুন।
                </p>
              )}
              {shopClosed && bagShop && (
                <p role="alert" className="rounded-2xl bg-amber-50 px-5 py-4 text-sm leading-6 text-amber-900 ring-1 ring-amber-200">
                  “{bagShop.name}” এখন বন্ধ — খুললে আপনার ব্যাগ থেকেই অর্ডার করতে পারবেন।
                </p>
              )}
              {minOrderShortfall > 0 && (
                <p
                  role="alert"
                  data-testid="min-order-hint"
                  className="rounded-2xl bg-amber-50 px-5 py-4 text-sm leading-6 text-amber-900 ring-1 ring-amber-200"
                >
                  {t("checkout.minOrderHint")
                    .replace("{amount}", formatBdt(minOrderShortfall))
                    .replace("{min}", courierMinLabel)}{" "}
                  <Link href="/shop" className="font-semibold underline underline-offset-2">
                    {t("checkout.exploreProducts")} →
                  </Link>
                </p>
              )}
              {fieldErrors.items && minOrderShortfall === 0 && (
                <p role="alert" className="rounded-2xl bg-amber-50 px-5 py-4 text-sm leading-6 text-amber-900 ring-1 ring-amber-200">
                  {fieldErrors.items}
                </p>
              )}
            </div>

            <div className="mt-5">
              <CheckoutAssurance />
            </div>

            <div className="mt-6" ref={errorRef}>
              <OrderErrorBanner
                error={orderError}
                title={t("checkout.errorTitle")}
                fixLabel={t("checkout.fixFields")}
                onFix={firstBadField ? () => jumpToField(firstBadField) : null}
              />
            </div>

            <button
              ref={ctaRef}
              type="submit"
              disabled={submitBlocked}
              className="tap-press mt-6 inline-flex h-14 w-full items-center justify-center gap-2 rounded-full bg-forest-800 text-sm font-semibold text-ivory-50 transition-colors hover:bg-forest-700 disabled:opacity-60"
            >
              {form.submitting
                ? t("checkout.placingOrder")
                : `${t("checkout.placeOrder")} · ${formatBdt(summary.total)}`}
              {!form.submitting && <IconArrowRight className="h-4 w-4" />}
            </button>
            {(mixedBag || shopClosed) && (
              <p className="mt-3 text-xs text-amber-800">উপরের ব্যাগ-সমস্যাটি ঠিক করে তারপর অর্ডার করুন।</p>
            )}
            <p className="mt-4 text-xs leading-5 text-ink-soft">
              অর্ডার করলে আপনি আমাদের{" "}
              <Link href="/terms" className="underline underline-offset-2">
                শর্তাবলী
              </Link>{" "}
              ও{" "}
              <Link href="/privacy" className="underline underline-offset-2">
                প্রাইভেসি পলিসি
              </Link>
              -তে সম্মত হচ্ছেন। একবার চাপলেই যথেষ্ট — ডাবল অর্ডার হয় না।
            </p>
          </StepSection>
        </div>

        <StickyOrderBar
          visible={stickyVisible}
          totalLabel={t("checkout.total")}
          total={formatBdt(summary.total)}
          ctaLabel={form.submitting ? t("checkout.placingOrder") : t("checkout.placeOrderShort")}
          disabled={submitBlocked}
          submitting={form.submitting}
          hint={stickyHint}
        />
      </form>

      {/* Order summary — desktop rail (phones get it inside step ③) */}
      <aside className="hidden lg:block">
        <div className="sticky top-28">{summaryCard(false)}</div>
      </aside>
    </div>
  );
}
