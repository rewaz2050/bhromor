"use client";

import CheckoutAssurance from "./checkout-assurance";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useCart } from "@/components/cart/cart-provider";
import BagShopHeader from "@/components/cart/bag-shop-header";
import { useLiveZones } from "@/lib/use-live-zones";
import { useLiveCatalog } from "@/lib/use-live-catalog";
import {
  isShopOrderable,
  lineShopIds,
  shopById,
} from "@/lib/shop-utils";
import { recordCouponUseInStore } from "@/lib/coupons-store";
import { ORDER_PREFIX } from "@/lib/catalog";
import {
  getDeliveryCode,
  makePlacedOrder,
  samePhone,
  type Order,
} from "@/lib/orders";
import { addOrderToStore } from "@/lib/order-store";
import { formatBdt } from "@/lib/format";
import {
  FIRST_FREE_DELIVERY_LIMIT,
  INSTANT_DELIVERY_TITLE,
  NIGHT_SURCHARGE_PAISA,
  RAIN_SURCHARGE_PAISA,
  deliveryBreakdown,
  orderTotal,
} from "@/lib/delivery";
import { useSettings } from "@/lib/use-settings";
import { isNightHour } from "@/lib/delivery";
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
import { getOrders } from "@/lib/order-store";
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
  getSavedAddresses,
  saveAddress,
  deleteAddress,
  type SavedAddress,
} from "@/lib/address-book";
import { getUpazilasForDistrict } from "@/lib/bd-geo";
import { addNotificationToStore } from "@/lib/notifications-store";
import MapPinPicker from "./map-pin-picker";

type TimeSlot = "now" | "evening" | "scheduled";
type DeliveryWindow = "9-11" | "11-1" | "2-4" | "4-6" | "6-8" | "8-10" | "express";

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
  deliveryDate: string; // YYYY-MM-DD
  deliveryWindow: DeliveryWindow;
  isPickup: boolean;
  pickupSlot: string;
  tipAmount: number; // taka
  submitting: boolean;
}

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
  deliveryDate: new Date().toISOString().slice(0, 10),
  deliveryWindow: "2-4",
  isPickup: false,
  pickupSlot: "now",
  tipAmount: 0,
  submitting: false,
};

/** Module-level "today" — bounds the scheduled-date picker (pure in render). */
const TODAY = new Date();
const MIN_DELIVERY_DATE = TODAY.toISOString().slice(0, 10);
const MAX_DELIVERY_DATE = new Date(TODAY.getTime() + 3 * 86400000)
  .toISOString()
  .slice(0, 10);

const isSunamganjDistrict = (district: string) =>
  district.trim().toLowerCase() === SUNAMGANJ_DISTRICT.toLowerCase();
const isSadarUpazila = (upazila: string) =>
  upazila.trim().toLowerCase() === SUNAMGANJ_UPAZILA.toLowerCase();

/** "9-11" → "09:00" etc. for the scheduled_at ISO stamp. */
const WINDOW_START_HOUR: Record<DeliveryWindow, string> = {
  "9-11": "09",
  "11-1": "11",
  "2-4": "14",
  "4-6": "16",
  "6-8": "18",
  "8-10": "20",
  express: "09",
};

export default function CheckoutView() {
  const { t } = useLanguage();
  const { detail, subtotal, clear } = useCart();
  const { activeZones: zoneList } = useLiveZones();
  const { shops } = useLiveCatalog();
  const { settings } = useSettings();
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
    deliveryCode?: string;
  } | null>(null);

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
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const nameRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const paraRef = useRef<HTMLInputElement>(null);
  const addressRef = useRef<HTMLTextAreaElement>(null);

  const [savedAddrs, setSavedAddrs] = useState<SavedAddress[]>([]);
  const [showSaved, setShowSaved] = useState(false);
  const [geoLoading, setGeoLoading] = useState(false);
  const [pinPos, setPinPos] = useState<LatLng | null>(null);
  const [showMap, setShowMap] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage hydration must happen post-mount
    setSavedAddrs(getSavedAddresses());
  }, []);

  /* ------------------------------------------------------------------ */
  /* Per-user first-10-free — this phone's earlier orders (local estimate; */
  /* the server recounts by phone before granting the promo)               */
  /* ------------------------------------------------------------------ */
  const userOrderCount = useMemo(
    () =>
      getOrders().filter(
        (o) => o.status !== "cancelled" && samePhone(o.customer?.phone ?? "", form.phone),
      ).length,
    [form.phone],
  );
  const userFreeRemaining = Math.max(0, FIRST_FREE_DELIVERY_LIMIT - userOrderCount);

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
                ? `${data.code} — Free Delivery 🚚 ${data.description ? `· ${data.description}` : ""}`
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

  const summary = useMemo(() => {
    if (!zone) {
      return {
        charge: 0,
        fullCharge: 0,
        freeDelivery: false,
        promoFree: false,
        couponFree: false,
        discount: 0,
        tip: 0,
        total: subtotal,
        itemCount: detail.reduce((n, l) => n + l.qty, 0),
        isOutside: derivedZoneId === "z4",
        breakdown: null as ReturnType<typeof deliveryBreakdown> | null,
        distanceKm: undefined as number | undefined,
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
    const breakdown = deliveryBreakdown({
      zone,
      subtotal,
      totalOrders: userOrderCount,
      distanceKm,
      weightKg,
      isNight,
      isRain,
      isExpress,
      isPickup: form.isPickup,
      tipAmount: form.tipAmount * 100,
      couponFree: couponFreeDelivery && !!activeCoupon,
      shopPrepMinutes: bagShop?.prepMinutes ?? 15,
      queueCount: 0,
    });
    const charge = breakdown.totalCharge;
    const discount = activeCoupon ? couponCheck.discount : 0;
    return {
      charge,
      fullCharge: zone.charge,
      freeDelivery: breakdown.freeDelivery,
      promoFree: breakdown.promoFree,
      couponFree: breakdown.couponFree,
      discount,
      tip: form.tipAmount * 100,
      total: orderTotal(subtotal, charge, discount) + form.tipAmount * 100,
      itemCount: detail.reduce((n, l) => n + l.qty, 0),
      isOutside: derivedZoneId === "z4",
      breakdown,
      distanceKm,
      isNight,
      isRain,
    };
  }, [
    zone,
    subtotal,
    detail,
    activeCoupon,
    couponCheck.discount,
    userOrderCount,
    couponFreeDelivery,
    pinPos,
    settings,
    bagShop,
    form.deliveryWindow,
    form.isPickup,
    form.tipAmount,
    derivedZoneId,
  ]);

  const empty = detail.length === 0;
  const shopClosed = bagShop ? !isShopOrderable(bagShop) : false;
  const mixedBag = lineShopIds(detail, shops[0]?.id ?? "").length > 1;

  if (placed) {
    const deliveryCode = placed.deliveryCode ?? getDeliveryCode(placed.orderId);
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
            অর্ডার ট্র্যাক করুন <IconArrowRight className="h-4 w-4" />
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
    setCouponCheck({ code: null, discount: 0, problem: null });
    setCouponMsg({ ok: true, text: "Checking code…" });
    setAppliedCode(code);
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
        label: `${effectivePara || "Address"} - ${form.name.split(" ")[0]}`,
        name: form.name,
        phone: form.phone,
        area: effectivePara,
        houseNo: form.houseNo,
        roadName: form.roadName,
        fullAddress: form.address,
        note: form.note,
        zoneId: derivedZoneId,
        lat: pinPos?.lat,
        lng: pinPos?.lng,
      });
    } catch {
      // storage unavailable — continue without saving
    }
  };

  const handleUseSaved = (addr: SavedAddress) => {
    const savedPara = addr.area;
    const listed = SADAR_PARA_OPTIONS.some((p) => p.name === savedPara);
    const savedDistrict = addr.district || SUNAMGANJ_DISTRICT;
    const savedUpazila = addr.upazila || SUNAMGANJ_UPAZILA;
    setForm((f) => ({
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
    }));
    if (addr.lat && addr.lng) setPinPos({ lat: addr.lat, lng: addr.lng });
    setShowSaved(false);
  };

  const handleGeolocate = () => {
    if (!navigator.geolocation) return;
    setGeoLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        // Clamp into Sunamganj bounds so the map pin stays meaningful.
        const clamped: LatLng = {
          lat: Math.min(SUNAMGANJ_BOUNDS.north, Math.max(SUNAMGANJ_BOUNDS.south, pos.coords.latitude)),
          lng: Math.min(SUNAMGANJ_BOUNDS.east, Math.max(SUNAMGANJ_BOUNDS.west, pos.coords.longitude)),
        };
        setPinPos(clamped);
        setShowMap(true);
        setGeoLoading(false);
      },
      () => setGeoLoading(false),
      { enableHighAccuracy: false, timeout: 5000 },
    );
  };

  const placeOrder = async () => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    update("submitting", true);
    setOrderError(null);
    setFieldErrors({});

    const fail = (message: string, fields?: Record<string, string>) => {
      submittingRef.current = false;
      update("submitting", false);
      setOrderError(message);
      if (fields) setFieldErrors(fields);
      const firstField = Object.keys(fields ?? {})[0];
      if (firstField === "name") nameRef.current?.focus();
      else if (firstField === "phone") phoneRef.current?.focus();
      else if (firstField === "area" || firstField === "para") paraRef.current?.focus();
      else if (firstField === "address") addressRef.current?.focus();
    };

    const localErrors: Record<string, string> = {};
    if (form.name.trim().length < 2)
      localErrors.name = "আপনার পুরো নাম লিখুন (কমপক্ষে ২ অক্ষর) — Please share your full name.";
    const phoneClean = form.phone.replace(/[\s\-]/g, "");
    if (!/^(?:\+?88)?01[0-9]{9}$/.test(phoneClean))
      localErrors.phone =
        "সঠিক মোবাইল নম্বর দিন — e.g. 017XXXXXXXX or +88017XXXXXXXX.";
    if (effectivePara.trim().length < 2)
      localErrors.area = "পাড়া / গ্রামের নাম সিলেক্ট বা লিখুন — pick or type your para.";
    if (!form.isPickup && form.address.trim().length < 6)
      localErrors.address =
        "বাসা নম্বর, রোড, ল্যান্ডমার্ক সহ ঠিকানা লিখুন — full delivery address required.";
    if (Object.keys(localErrors).length > 0) {
      fail("অনুগ্রহ করে লাল চিহ্নিত ঘরগুলো ঠিক করুন — fix the highlighted fields.", localErrors);
      return;
    }

    const fullAddress = form.isPickup
      ? `Store Pickup — ${SUNAMGANJ_HUB}, ${SUNAMGANJ_UPAZILA}, ${SUNAMGANJ_DISTRICT}`
      : buildFullAddress();

    const placeLocally = () => {
      const stamp = new Date();
      const date = `${stamp.getFullYear()}${String(stamp.getMonth() + 1).padStart(2, "0")}${String(stamp.getDate()).padStart(2, "0")}`;
      const seq = String(Math.floor(1000 + Math.random() * 9000));
      const orderId = `${ORDER_PREFIX}-${date}-${seq}`;
      addOrderToStore(
        makePlacedOrder({
          id: orderId,
          createdAt: stamp.getTime(),
          customer: {
            name: form.name,
            phone: form.phone,
            area: form.isPickup ? "Pickup — " + SUNAMGANJ_HUB : effectivePara,
            address: fullAddress,
            note: form.note,
          },
          zone: {
            id: zone.id,
            name: zone.name,
            etaLabel: form.isPickup
              ? `Ready in ${bagShop?.prepMinutes ?? 15} min`
              : (summary.breakdown?.eta ?? zone.etaLabel),
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
      // → Admin notification (same device / demo inbox)
      addNotificationToStore({
        kind: "order",
        title: `নতুন অর্ডার ${orderId} — কনফার্মেশন দরকার`,
        body: [
          form.name,
          form.isPickup
            ? `Pickup · ${SUNAMGANJ_HUB}`
            : `${effectivePara} · ${effectiveUpazila} · ${form.district}`,
          `${formatBdt(summary.total)} COD`,
          summary.freeDelivery && !form.isPickup ? "ফ্রি ডেলিভারি" : null,
          summary.tip > 0 ? `টিপ ${formatBdt(summary.tip)}` : null,
        ]
          .filter(Boolean)
          .join(" · "),
        href: `/admin/orders/${orderId}`,
      });
      setPlaced({
        orderId,
        eta: form.isPickup
          ? `Ready in ${bagShop?.prepMinutes ?? 15} min`
          : (summary.breakdown?.eta ?? zone.etaLabel),
        charge: summary.charge,
        total: summary.total,
        addressSummary: form.isPickup
          ? `${SUNAMGANJ_HUB}, ${SUNAMGANJ_UPAZILA}`
          : fullAddress,
      });
      clear();
    };

    let res: Response;
    try {
      const scheduledAt =
        form.timeSlot === "scheduled"
          ? new Date(
              `${form.deliveryDate}T${WINDOW_START_HOUR[form.deliveryWindow]}:00:00`,
            ).toISOString()
          : null;
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
          delivery_window:
            form.timeSlot === "scheduled" ? form.deliveryWindow : form.timeSlot,
          is_express:
            form.deliveryWindow === "express" && settings.expressDeliveryEnabled,
          is_pickup: form.isPickup,
          pickup_slot: form.isPickup ? form.pickupSlot : null,
          tip_amount: form.tipAmount * 100,
          weight_kg: detail.reduce((s, l) => s + l.qty * 0.5, 0),
          is_rain: settings.rainSurchargeEnabled,
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
        "সার্ভারে পৌঁছানো যাচ্ছে না — ইন্টারনেট চেক করে আবার চেষ্টা করুন। Could not reach the shop — check your connection and try again.",
      );
      return;
    }

    let body: unknown = null;
    try {
      body = await res.json();
    } catch {}
    const data = (body ?? {}) as {
      demoMode?: boolean;
      order?: Order;
      error?: string;
      errors?: { field: string; message: string }[];
      field?: string;
    };

    if (res.ok && data.demoMode) {
      persistAddress();
      placeLocally();
      return;
    }
    if (res.ok && data.order) {
      persistAddress();
      addOrderToStore(data.order);
      setPlaced({
        orderId: data.order.id,
        eta: form.isPickup
          ? `Ready in ${bagShop?.prepMinutes ?? 15} min`
          : (summary.breakdown?.eta ?? data.order.etaLabel),
        charge: data.order.deliveryCharge,
        total: data.order.total,
        addressSummary: form.isPickup
          ? `${SUNAMGANJ_HUB}, ${SUNAMGANJ_UPAZILA}`
          : fullAddress,
        deliveryCode: data.order.deliveryCode,
      });
      clear();
      return;
    }
    const fieldMap: Record<string, string> = {};
    for (const e of data.errors ?? []) {
      if (e.field) fieldMap[e.field] = e.message;
      if (e.field?.startsWith("items")) fieldMap.items = e.message;
    }
    if (data.field) fieldMap[data.field] = data.error ?? "";
    const serverMessage =
      data.errors?.map((e) => e.message).join(" ") || data.error;
    fail(
      serverMessage ||
        "অর্ডার প্লেস করা যায়নি — আবার চেষ্টা করুন। Could not place the order — please try again.",
      Object.keys(fieldMap).length > 0 ? fieldMap : undefined,
    );
  };

  const inputClass = (field: string) =>
    `h-12 w-full rounded-2xl bg-paper px-4 text-sm text-ink ring-1 placeholder:text-ink-soft/50 focus:ring-2 focus:ring-forest-500 ${
      fieldErrors[field] ? "ring-rose-300 bg-rose-50/50" : "ring-line"
    }`;

  const paraIsSelect = sadarUpazila;

  return (
    <div className="grid gap-12 lg:grid-cols-[1fr_400px]">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          placeOrder();
        }}
        className="min-w-0"
      >
        {/* Per-user first-10-free promo note */}
        <div className="mb-8 rounded-2xl bg-gradient-to-r from-forest-800 to-forest-900 p-4 text-ivory-50 ring-1 ring-forest-700">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gold-400 text-forest-900">
              <IconGift className="h-4 w-4" />
            </span>
            <div className="flex-1">
              <p className="text-sm font-bold">
                🎉 প্রতিটি কাস্টমারের প্রথম {FIRST_FREE_DELIVERY_LIMIT} টি অর্ডারে ডেলিভারি সম্পূর্ণ ফ্রি!
              </p>
              <p className="mt-0.5 text-xs text-ivory-100/80">
                শুধুমাত্র <strong>সুনামগঞ্জ সিটি (এ জোন)</strong>-এর ভেতরে · এ জোনের বাইরে জোন
                চার্জ (৳৩০–৳১০০)।{" "}
                {form.phone.trim() !== ""
                  ? `আপনার এ জোনে বাকি ফ্রি ডেলিভারি: ${userFreeRemaining} টি।`
                  : "মোবাইল নম্বর দিলে আপনার বাকি ফ্রি দেখা যাবে।"}
              </p>
            </div>
          </div>
        </div>

        {/* Saved addresses + geolocate */}
        <div className="mb-6 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleGeolocate}
            disabled={geoLoading}
            className="inline-flex items-center gap-1.5 rounded-full bg-paper px-4 py-2 text-xs font-medium ring-1 ring-line hover:bg-ivory-100"
          >
            <IconMapPin className="h-3.5 w-3.5" />
            {geoLoading ? "Locating..." : "Use my location"}
          </button>
          {savedAddrs.length > 0 && (
            <button
              type="button"
              onClick={() => setShowSaved(!showSaved)}
              className="inline-flex items-center gap-1.5 rounded-full bg-paper px-4 py-2 text-xs font-medium ring-1 ring-line hover:bg-ivory-100"
            >
              📚 Saved addresses ({savedAddrs.length})
            </button>
          )}
        </div>
        {showSaved && savedAddrs.length > 0 && (
          <div className="mb-6 rounded-2xl bg-paper p-4 ring-1 ring-line">
            <p className="text-xs font-bold uppercase tracking-wider text-ink-soft mb-3">Saved addresses — Sunamganj</p>
            <div className="space-y-2">
              {savedAddrs.map((addr) => (
                <div key={addr.id} className="flex items-center justify-between rounded-xl bg-ivory-50 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink truncate">{addr.label} — {addr.area}</p>
                    <p className="text-xs text-ink-soft truncate">{addr.houseNo} {addr.roadName} {addr.fullAddress}</p>
                  </div>
                  <div className="flex gap-1.5 shrink-0 ml-3">
                    <button
                      type="button"
                      onClick={() => handleUseSaved(addr)}
                      className="rounded-full bg-forest-800 px-3 py-1 text-xs font-semibold text-white"
                    >
                      Use
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        deleteAddress(addr.id);
                        setSavedAddrs(getSavedAddresses());
                      }}
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

        {/* Contact */}
        <section>
          <h2 className="font-display text-xl font-medium text-forest-900">
            {t("checkout.deliveryDetails")}
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            সহজ ফর্ম — জেলা → উপজেলা → পাড়া সিলেক্ট করুন, বাকিটা অটো হিসাব হবে।
          </p>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-ink">
                আপনার নাম / Full name <span className="text-rose-600">*</span>
              </span>
              <input
                ref={nameRef}
                required
                value={form.name}
                onChange={(e) => {
                  update("name", e.target.value);
                  if (fieldErrors.name) setFieldErrors((f) => ({ ...f, name: "" }));
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
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-ink">
                মোবাইল নম্বর / Mobile number <span className="text-rose-600">*</span>
              </span>
              <input
                ref={phoneRef}
                required
                type="tel"
                inputMode="tel"
                value={form.phone}
                onChange={(e) => {
                  update("phone", e.target.value);
                  if (fieldErrors.phone) setFieldErrors((f) => ({ ...f, phone: "" }));
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
                  এই নম্বরে রাইডার কল করবে — ১১ ডিজিটের সঠিক নম্বর দিন।
                </p>
              )}
            </label>
          </div>

          {/* District / Upazila / Para — the simple address ladder */}
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-ink">
                জেলা / District <span className="text-rose-600">*</span>
              </span>
              <select
                required
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
                  এই মুহূর্তে ডেলিভারি সুনামগঞ্জ জেলায় — অন্য জেলায় কুরিয়ার চার্জ (৳১০০) যোগ হবে।
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
            {paraIsSelect ? (
              <>
                {/* All paras as direct tappable chips — no dropdown needed */}
                <div className="space-y-3" role="group" aria-label="আপনার পাড়া সিলেক্ট করুন">
                  {(
                    [
                      { zoneId: "z1", label: "সুনামগঞ্জ সিটি — এ জোন · প্রথম ১০ অর্ডারে ফ্রি", tone: "green" },
                      { zoneId: "z2", label: "সদর কোর — বি জোন · ৳৫০", tone: "plain" },
                      { zoneId: "z3", label: "সদর এক্সটেন্ডেড — সি জোন · ৳৭০", tone: "plain" },
                    ] as const
                  ).map((group) => (
                    <div key={group.zoneId}>
                      <p className={`mb-1.5 text-[11px] font-bold uppercase tracking-wider ${group.tone === "green" ? "text-forest-700" : "text-ink-soft"}`}>
                        {group.label}
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {SADAR_PARA_OPTIONS.filter((p) => p.zoneId === group.zoneId).map((p) => {
                          const selected = form.paraSelected === p.name;
                          return (
                            <button
                              key={p.name}
                              type="button"
                              aria-pressed={selected}
                              onClick={() => {
                                update("paraSelected", p.name);
                                update("paraCustom", "");
                                if (fieldErrors.area) setFieldErrors((f) => ({ ...f, area: "" }));
                              }}
                              className={`rounded-full px-3.5 py-2 text-xs font-medium ring-1 transition-colors ${
                                selected
                                  ? "bg-forest-800 text-ivory-50 ring-forest-700"
                                  : group.tone === "green"
                                    ? "bg-forest-50 text-forest-900 ring-forest-200 hover:bg-forest-100"
                                    : "bg-paper text-ink ring-line hover:bg-ivory-100"
                              }`}
                            >
                              {selected && "✓ "}{p.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                  <div>
                    <button
                      type="button"
                      aria-pressed={form.paraSelected === PARA_CUSTOM}
                      onClick={() => {
                        update("paraSelected", PARA_CUSTOM);
                        if (fieldErrors.area) setFieldErrors((f) => ({ ...f, area: "" }));
                      }}
                      className={`rounded-full px-3.5 py-2 text-xs font-medium ring-1 transition-colors ${
                        form.paraSelected === PARA_CUSTOM
                          ? "bg-forest-800 text-ivory-50 ring-forest-700"
                          : "bg-paper text-ink ring-line hover:bg-ivory-100"
                      }`}
                    >
                      {form.paraSelected === PARA_CUSTOM && "✓ "}অন্য পাড়া / গ্রাম — নিজে লিখব
                    </button>
                    {form.paraSelected === PARA_CUSTOM && (
                      <input
                        ref={paraRef}
                        value={form.paraCustom}
                        onChange={(e) => {
                          update("paraCustom", e.target.value);
                          if (fieldErrors.area) setFieldErrors((f) => ({ ...f, area: "" }));
                        }}
                        placeholder="পাড়া / গ্রামের নাম লিখুন"
                        aria-invalid={!!fieldErrors.area}
                        className={`mt-2 ${inputClass("area")}`}
                      />
                    )}
                  </div>
                </div>
              </>
            ) : (
              <input
                ref={paraRef}
                required
                value={form.paraCustom}
                onChange={(e) => {
                  update("paraCustom", e.target.value);
                  if (fieldErrors.area) setFieldErrors((f) => ({ ...f, area: "" }));
                }}
                placeholder="আপনার পাড়া / গ্রামের নাম লিখুন"
                aria-invalid={!!fieldErrors.area}
                className={inputClass("area")}
              />
            )}
            {fieldErrors.area && (
              <p className="mt-1.5 text-xs text-rose-700">{fieldErrors.area}</p>
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

          {/* Map Pin Picker - Sunamganj real geo */}
          <div className="mt-6">
            <div className="flex items-center justify-between">
              <span className="mb-2 block text-sm font-medium text-ink">
                📍 ম্যাপে বাড়ি সিলেক্ট করুন / Pin your house{" "}
                <span className="font-normal text-ink-soft">(ঐচ্ছিক — রাইডার সহজে খুঁজে পাবে)</span>
              </span>
              <button
                type="button"
                onClick={() => setShowMap((v) => !v)}
                className="mb-2 rounded-full bg-forest-800 px-3 py-1 text-xs font-semibold text-white"
              >
                {showMap ? "Hide Map" : "Show Map"}
              </button>
            </div>
            {showMap && (
              <MapPinPicker
                value={pinPos}
                onChange={(pos) => setPinPos(pos)}
              />
            )}
            {pinPos && (
              <p className="mt-2 text-xs text-forest-700 font-medium">
                📌 Pin: {pinPos.lat.toFixed(5)}, {pinPos.lng.toFixed(5)} · {distanceFromHubKm(pinPos).toFixed(2)} km from {SUNAMGANJ_HUB} · {findZoneByDistance(pinPos).name}
              </p>
            )}
          </div>

          <label className="mt-4 block">
            <span className="mb-1.5 block text-sm font-medium text-ink">
              বিস্তারিত ঠিকানা / Full address <span className="text-rose-600">*</span>
            </span>
            <textarea
              ref={addressRef}
              required={!form.isPickup}
              rows={3}
              value={form.address}
              onChange={(e) => {
                update("address", e.target.value);
                if (fieldErrors.address) setFieldErrors((f) => ({ ...f, address: "" }));
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

          <label className="mt-4 block">
            <span className="mb-1.5 block text-sm font-medium text-ink">
              অর্ডার নোট <span className="font-normal text-ink-soft">({t("checkout.optional")})</span>
            </span>
            <input
              value={form.note}
              onChange={(e) => update("note", e.target.value)}
              placeholder="যেমন: ডেলিভারির আগে কল করবেন"
              className="h-12 w-full rounded-2xl bg-paper px-4 text-sm text-ink ring-1 ring-line placeholder:text-ink-soft/50 focus:ring-2 focus:ring-forest-500"
            />
          </label>
        </section>

        {/* Delivery Time Slot */}
        <div className="mt-6 space-y-3">
          <span className="mb-2 block text-sm font-medium text-ink">ডেলিভারি সময় / Delivery Slot</span>
          <div className="grid grid-cols-3 gap-2">
            {[
              { id: "now" as TimeSlot, label: "এখনই", sub: (summary.breakdown?.eta ?? zone.etaLabel), icon: "⚡" },
              { id: "evening" as TimeSlot, label: "সন্ধ্যায়", sub: "6-9 PM", icon: "🌙" },
              { id: "scheduled" as TimeSlot, label: "শিডিউল", sub: "Pick date/time", icon: "📅" },
            ].map((slot) => (
              <button
                key={slot.id}
                type="button"
                onClick={() => update("timeSlot", slot.id)}
                className={`rounded-2xl px-3 py-3 text-left ring-1 transition-colors ${
                  form.timeSlot === slot.id
                    ? "bg-forest-800 text-ivory-50 ring-forest-700"
                    : "bg-paper text-ink ring-line hover:bg-ivory-100"
                }`}
              >
                <span className="text-sm">{slot.icon} {slot.label}</span>
                <span className={`block text-[11px] mt-0.5 ${form.timeSlot === slot.id ? "text-ivory-100/70" : "text-ink-soft"}`}>{slot.sub}</span>
              </button>
            ))}
          </div>
          {form.timeSlot === "scheduled" && (
            <div className="rounded-2xl bg-paper p-4 ring-1 ring-line space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-ink">Delivery Date</span>
                  <input
                    type="date"
                    value={form.deliveryDate}
                    min={MIN_DELIVERY_DATE}
                    max={MAX_DELIVERY_DATE}
                    onChange={(e) => update("deliveryDate", e.target.value)}
                    className="h-10 w-full rounded-xl bg-ivory-50 px-3 text-sm ring-1 ring-line"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-ink">Time Window</span>
                  <select
                    value={form.deliveryWindow}
                    onChange={(e) => update("deliveryWindow", e.target.value as DeliveryWindow)}
                    className="h-10 w-full rounded-xl bg-ivory-50 px-3 text-sm ring-1 ring-line"
                  >
                    <option value="9-11">9 AM - 11 AM</option>
                    <option value="11-1">11 AM - 1 PM</option>
                    <option value="2-4">2 PM - 4 PM</option>
                    <option value="4-6">4 PM - 6 PM</option>
                    <option value="6-8">6 PM - 8 PM</option>
                    <option value="8-10">8 PM - 10 PM</option>
                    {settings.expressDeliveryEnabled && (
                      <option value="express">⚡ Express 30min (+৳40)</option>
                    )}
                  </select>
                </label>
              </div>
              <p className="text-[11px] text-ink-soft">
                Scheduled delivery: {form.deliveryDate} {form.deliveryWindow} · Shop will prepare accordingly.
                {form.deliveryWindow === "express" && ` Express adds ${formatBdt(4000)}.`}
              </p>
            </div>
          )}
        </div>

        {/* Delivery estimate — dynamic */}
        <section className="mt-10">
          <h2 className="font-display text-xl font-medium text-forest-900">
            {t("checkout.deliveryEstimate")}
          </h2>
          <div className="mt-5 flex items-start gap-4 rounded-2xl bg-forest-900 p-5 text-ivory-100">
            <IconTruck className="mt-0.5 h-6 w-6 shrink-0 text-gold-300" />
            <div className="text-sm leading-6 flex-1">
              <p className="font-semibold">
                {form.isPickup ? `🏪 Pickup — ${SUNAMGANJ_HUB}` : zone.name}
                {summary.distanceKm ? ` · ${summary.distanceKm.toFixed(2)}km from ${SUNAMGANJ_HUB}` : ""}
              </p>
              <p className="mt-1 text-ivory-100/70">
                {INSTANT_DELIVERY_TITLE} — কনফার্মেশনের পর{" "}
                <strong className="text-gold-300">
                  {form.isPickup
                    ? `Ready in ${bagShop?.prepMinutes ?? 15} min`
                    : (summary.breakdown?.eta ?? zone.etaLabel)}
                </strong>{" "}
                · ডেলিভারি চার্জ{" "}
                <strong>
                  {summary.freeDelivery ? (
                    <span className="text-gold-300">
                      {summary.couponFree
                        ? "FREE — Coupon 🚚"
                        : summary.promoFree
                          ? `FREE (প্রথম ${FIRST_FREE_DELIVERY_LIMIT} অর্ডার 🎉)`
                          : form.isPickup
                            ? "FREE — Pickup"
                            : "Free"}
                    </span>
                  ) : (
                    formatBdt(summary.charge)
                  )}
                </strong>
                {summary.breakdown && summary.breakdown.surcharge.total > 0 && !summary.freeDelivery && (
                  <span className="mt-1 block text-xs text-amber-200">
                    Base {formatBdt(summary.fullCharge)}
                    {summary.breakdown.surcharge.distance > 0 && ` + Distance ${formatBdt(summary.breakdown.surcharge.distance)}`}
                    {summary.breakdown.surcharge.night > 0 && ` + Night ${formatBdt(summary.breakdown.surcharge.night)}`}
                    {summary.breakdown.surcharge.rain > 0 && ` + Rain ${formatBdt(summary.breakdown.surcharge.rain)}`}
                    {summary.breakdown.surcharge.express > 0 && ` + Express ${formatBdt(summary.breakdown.surcharge.express)}`}
                    {summary.breakdown.surcharge.weight > 0 && ` + Weight ${formatBdt(summary.breakdown.surcharge.weight)}`}
                  </span>
                )}
                {summary.isOutside && !summary.freeDelivery && (
                  <span className="mt-1 block text-xs text-amber-200">
                    সুনামগঞ্জ সদরের বাইরে — সর্বনিম্ন ৳৫০০ অর্ডার প্রয়োজন, চার্জ ৳১০০।
                  </span>
                )}
                {summary.isNight && !summary.freeDelivery && (
                  <span className="mt-1 block text-xs text-gold-300">🌙 Night surcharge +{formatBdt(NIGHT_SURCHARGE_PAISA)} (9PM-6AM)</span>
                )}
                {summary.isRain && !summary.freeDelivery && (
                  <span className="mt-1 block text-xs text-sky-300">🌧️ Rain surcharge +{formatBdt(RAIN_SURCHARGE_PAISA)}</span>
                )}
              </p>
            </div>
          </div>
        </section>

        {/* Pickup + Tips */}
        <section className="mt-10 space-y-4">
          <h2 className="font-display text-xl font-medium text-forest-900">Pickup & Tips</h2>
          <div className="flex flex-wrap gap-3">
            <label className="flex items-center gap-2 rounded-2xl bg-paper px-4 py-3 ring-1 ring-line cursor-pointer">
              <input
                type="checkbox"
                checked={form.isPickup}
                onChange={(e) => update("isPickup", e.target.checked)}
                className="h-4 w-4"
              />
              <span className="text-sm font-medium">🏪 Store Pickup at {SUNAMGANJ_HUB} — Free, no delivery charge</span>
            </label>
          </div>
          {form.isPickup && (
            <div className="mt-2">
              <p className="text-xs font-medium mb-1">Pickup time slot ({SUNAMGANJ_HUB}, {SUNAMGANJ_UPAZILA})</p>
              <div className="flex flex-wrap gap-2">
                {["now", "9-11", "11-1", "2-4", "4-6", "6-8"].map((slot) => (
                  <button
                    key={slot}
                    type="button"
                    onClick={() => update("pickupSlot", slot)}
                    className={`rounded-full px-3 py-1.5 text-xs ring-1 ${form.pickupSlot === slot ? "bg-forest-800 text-white ring-forest-700" : "bg-paper ring-line"}`}
                  >
                    {slot === "now" ? "Now (15 min)" : slot}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div>
            <p className="text-sm font-medium mb-2">💝 Tip for Rider (optional) — 100% goes to rider</p>
            <div className="flex flex-wrap gap-2">
              {[0, 10, 20, 30, 50].map((tip) => (
                <button
                  key={tip}
                  type="button"
                  onClick={() => update("tipAmount", tip)}
                  className={`rounded-full px-4 py-2 text-xs font-semibold ring-1 ${form.tipAmount === tip ? "bg-forest-800 text-white ring-forest-700" : "bg-paper text-ink ring-line"}`}
                >
                  {tip === 0 ? "No tip" : `৳${tip}`}
                </button>
              ))}
            </div>
            {form.tipAmount > 0 && (
              <p className="mt-2 text-xs text-forest-700">Thank you! ৳{form.tipAmount} will go to your rider.</p>
            )}
          </div>
        </section>

        {/* Promo / coupon code — lives WITH the order, right before placing */}
        <section className="mt-10">
          <h2 className="font-display text-xl font-medium text-forest-900">
            {t("checkout.haveCoupon")}
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            কুপন কোড থাকলে এখানে লিখুন — ছাড়টা ডান পাশের মোট টাকা থেকে কাটা যাবে।
          </p>
          <div className="mt-5 max-w-md">
            {activeCoupon ? (
              <div className="flex items-center justify-between rounded-2xl bg-forest-50 px-4 py-3.5 text-sm ring-1 ring-forest-200">
                <span className="flex items-center gap-2">
                  <IconGift className="h-4 w-4 text-forest-700" />
                  <span className="font-mono font-bold text-forest-800">
                    {activeCoupon.code}
                  </span>
                  <span className="text-xs text-forest-700">প্রয়োগ হয়েছে ✓</span>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setAppliedCode("");
                    setCouponCheck({ code: null, discount: 0, problem: null });
                    setCouponFreeDelivery(false);
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
                  className="h-12 w-full min-w-0 rounded-2xl bg-paper px-4 text-sm uppercase tracking-wide text-ink ring-1 ring-line placeholder:normal-case placeholder:tracking-normal placeholder:text-ink-soft/50 focus:ring-2 focus:ring-forest-500"
                />
                <button
                  type="button"
                  onClick={applyCoupon}
                  className="shrink-0 rounded-2xl bg-forest-800 px-6 text-sm font-semibold text-ivory-50 transition-colors hover:bg-forest-700"
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
        </section>

        {/* Payment */}
        <section className="mt-10">
          <h2 className="font-display text-xl font-medium text-forest-900">
            {t("checkout.paymentMethod")}
          </h2>
          <div className="mt-5 space-y-3">
            <label className="flex cursor-pointer items-center gap-4 rounded-2xl border border-forest-600 bg-forest-50 p-5 transition-colors">
              <input
                type="radio"
                name="payment"
                value="cod"
                checked
                readOnly
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
          </div>
        </section>

        {mixedBag && (
          <p role="alert" className="mt-8 rounded-2xl bg-amber-50 px-5 py-4 text-sm leading-6 text-amber-900 ring-1 ring-amber-200">
            Your bag has items from {lineShopIds(detail, shops[0]?.id ?? "").length} different shops — one order can only be from one shop. Check out each shop separately.
          </p>
        )}
        {shopClosed && bagShop && (
          <p role="alert" className="mt-4 rounded-2xl bg-amber-50 px-5 py-4 text-sm leading-6 text-amber-900 ring-1 ring-amber-200">
            “{bagShop.name}” is closed right now — your bag will keep until it reopens.
          </p>
        )}

        {fieldErrors.items && (
          <p role="alert" className="mt-4 rounded-2xl bg-amber-50 px-5 py-4 text-sm leading-6 text-amber-900 ring-1 ring-amber-200">
            {fieldErrors.items}
          </p>
        )}
        {fieldErrors.couponCode && (
          <p role="alert" className="mt-4 rounded-2xl bg-amber-50 px-5 py-4 text-sm leading-6 text-amber-900 ring-1 ring-amber-200">
            Coupon: {fieldErrors.couponCode}
          </p>
        )}

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
          disabled={form.submitting || mixedBag || shopClosed}
          className="mt-10 inline-flex h-14 w-full items-center justify-center gap-2 rounded-full bg-forest-800 text-sm font-semibold text-ivory-50 transition-colors hover:bg-forest-700 disabled:opacity-60 sm:w-auto sm:px-10"
        >
          {form.submitting ? t("checkout.placingOrder") : t("checkout.placeOrder")}
          {!form.submitting && <IconArrowRight className="h-4 w-4" />}
        </button>
        {(mixedBag || shopClosed) && (
          <p className="mt-3 text-xs text-amber-800">Fix the bag issue above before placing the order.</p>
        )}
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
            {form.isPickup ? `Pickup — ${SUNAMGANJ_HUB}` : `${INSTANT_DELIVERY_TITLE} — ${zone.name}`}
          </p>
          <p className="mt-2 rounded-xl bg-gold-50 px-3 py-2 text-xs font-bold text-forest-900 ring-1 ring-gold-200">
            🎉 প্রতি কাস্টমারের প্রথম {FIRST_FREE_DELIVERY_LIMIT} অর্ডারে ফ্রি — আপনার বাকি {userFreeRemaining} টি (এ জোনে)
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
          {/* Applied coupon note — the full promo section lives in the form */}
          {activeCoupon && (
            <div className="mt-6 flex items-center justify-between rounded-xl bg-forest-50 px-3.5 py-2.5 text-sm ring-1 ring-forest-200">
              <span className="font-mono font-bold text-forest-800">
                {activeCoupon.code}
              </span>
              <button
                type="button"
                onClick={() => {
                  setAppliedCode("");
                  setCouponCheck({ code: null, discount: 0, problem: null });
                  setCouponFreeDelivery(false);
                  setCouponMsg(null);
                  update("couponCode", "");
                }}
                className="text-xs font-semibold text-ink-soft underline underline-offset-2 hover:text-rose-700"
              >
                {t("checkout.remove")}
              </button>
            </div>
          )}

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
              <dt className="text-ink-soft">
                {t("checkout.delivery")} · {summary.breakdown?.eta ?? zone.etaLabel}
              </dt>
              <dd className="font-medium text-ink">
                {summary.freeDelivery ? (
                  <span className="text-forest-700">
                    {summary.couponFree
                      ? "FREE 🚚 Coupon"
                      : summary.promoFree
                        ? "FREE 🎉"
                        : form.isPickup
                          ? "FREE — Pickup"
                          : "Free"}{" "}
                    <span className="text-ink-soft line-through">
                      {formatBdt(summary.fullCharge)}
                    </span>
                  </span>
                ) : (
                  formatBdt(summary.charge)
                )}
              </dd>
            </div>
            {summary.breakdown && summary.breakdown.surcharge.total > 0 && !summary.freeDelivery && (
              <div className="text-xs space-y-1 pl-1 text-ink-soft">
                <div className="flex justify-between"><span>Base {zone.name}</span><span>{formatBdt(summary.fullCharge)}</span></div>
                {summary.breakdown.surcharge.distance > 0 && <div className="flex justify-between"><span>Distance {summary.distanceKm?.toFixed(2)}km</span><span>+{formatBdt(summary.breakdown.surcharge.distance)}</span></div>}
                {summary.breakdown.surcharge.night > 0 && <div className="flex justify-between"><span>🌙 Night (9PM-6AM)</span><span>+{formatBdt(summary.breakdown.surcharge.night)}</span></div>}
                {summary.breakdown.surcharge.rain > 0 && <div className="flex justify-between"><span>🌧️ Rain</span><span>+{formatBdt(summary.breakdown.surcharge.rain)}</span></div>}
                {summary.breakdown.surcharge.express > 0 && <div className="flex justify-between"><span>⚡ Express</span><span>+{formatBdt(summary.breakdown.surcharge.express)}</span></div>}
                {summary.breakdown.surcharge.weight > 0 && <div className="flex justify-between"><span>⚖️ Weight</span><span>+{formatBdt(summary.breakdown.surcharge.weight)}</span></div>}
              </div>
            )}
            {summary.couponFree && (
              <p className="rounded-xl bg-forest-50 px-3 py-2 text-xs leading-5 text-forest-900 ring-1 ring-forest-200">
                🚚 Free delivery coupon applied — {activeCoupon?.code}
              </p>
            )}
            {summary.promoFree && (
              <p className="rounded-xl bg-gold-50 px-3 py-2 text-xs leading-5 text-forest-900 ring-1 ring-gold-200">
                🎉 আপনার প্রথম {FIRST_FREE_DELIVERY_LIMIT} অর্ডারের প্রোমো — ডেলিভারি ফ্রি! বাকি {userFreeRemaining} টি।
              </p>
            )}
            {summary.tip > 0 && (
              <div className="flex justify-between">
                <dt className="text-ink-soft">💝 Tip for Rider</dt>
                <dd className="font-medium text-forest-700">+{formatBdt(summary.tip)}</dd>
              </div>
            )}
            {form.isPickup && (
              <p className="rounded-xl bg-sky-50 px-3 py-2 text-xs text-sky-900 ring-1 ring-sky-200">🏪 Pickup at {SUNAMGANJ_HUB} — no delivery, ready in {bagShop?.prepMinutes ?? 15} min</p>
            )}
            <div className="flex justify-between pt-2 text-base">
              <dt className="font-semibold text-ink">
                {t("checkout.totalCod")}{form.isPickup ? " (Pickup)" : ""}
              </dt>
              <dd className="font-bold text-ink">{formatBdt(summary.total)}</dd>
            </div>
          </dl>
          <p className="mt-5 flex items-start gap-2 rounded-xl bg-ivory-100 px-3.5 py-3 text-xs leading-5 text-ink-soft">
            <IconBox className="mt-0.5 h-4 w-4 shrink-0 text-forest-700" />
            {t("checkout.followOrderHint")} — COD, PIN required.
          </p>
        </div>
      </aside>
    </div>
  );
}
