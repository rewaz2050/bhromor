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
  isShopOrderable,
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
  FREE_DELIVERY_THRESHOLD,
  INSTANT_DELIVERY_TITLE,
  FIRST_1000_FREE_LIMIT,
  deliveryChargeFor,
  deliveryChargeWithPromo,
  deliveryBreakdown,
  freeThresholdForZone,
  isNightHour,
  NIGHT_SURCHARGE_PAISA,
  RAIN_SURCHARGE_PAISA,
  EXPRESS_SURCHARGE_PAISA,
  orderTotal,
} from "@/lib/delivery";
import { useSettings } from "@/lib/use-settings";
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
import { usePromo } from "@/lib/use-promo";
import {
  SUNAMGANJ_DISTRICT,
  SUNAMGANJ_UPAZILA,
  ALL_PARAS,
  ROAD_NAMES,
  findZoneByPara,
  getParaSuggestions,
  MIN_ORDER_OUTSIDE_PAISA,
} from "@/lib/sunamganj";
import {
  getSavedAddresses,
  saveAddress,
  deleteAddress,
  formatFullAddress,
  type SavedAddress,
} from "@/lib/address-book";
import MapPinPicker from "./map-pin-picker";
import type { LatLng } from "@/lib/sunamganj";
import { distanceFromHubKm, findZoneByDistance } from "@/lib/sunamganj";

type TimeSlot = "now" | "evening" | "tomorrow_morning" | "scheduled";
type DeliveryWindow = "9-11" | "11-1" | "2-4" | "4-6" | "6-8" | "8-10" | "express";

interface FormState {
  name: string;
  phone: string;
  area: string;
  houseNo: string;
  roadName: string;
  address: string;
  note: string;
  couponCode: string;
  zoneId: string;
  lat?: number;
  lng?: number;
  payment: "cod";
  timeSlot: TimeSlot;
  deliveryDate: string; // YYYY-MM-DD
  deliveryWindow: DeliveryWindow;
  isPickup: boolean;
  tipAmount: number; // taka
  weightKg: number;
  submitting: boolean;
}

const initialForm: FormState = {
  name: "",
  phone: "",
  area: "",
  houseNo: "",
  roadName: "",
  address: "",
  note: "",
  couponCode: "",
  zoneId: "",
  lat: undefined,
  lng: undefined,
  payment: "cod",
  timeSlot: "now",
  deliveryDate: new Date().toISOString().slice(0,10),
  deliveryWindow: "express",
  isPickup: false,
  tipAmount: 0,
  weightKg: 0,
  submitting: false,
};

const DISTRICT = SUNAMGANJ_DISTRICT;
const UPAZILA = SUNAMGANJ_UPAZILA;

export default function CheckoutView() {
  const { t } = useLanguage();
  const { detail, subtotal, clear } = useCart();
  const { activeZones: zoneList } = useLiveZones();
  const { shops } = useLiveCatalog();
  const { zoneId: myZoneId, setZoneId: setMyZoneId } = useMyZone();
  const promo = usePromo();
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
  const areaRef = useRef<HTMLInputElement>(null);
  const addressRef = useRef<HTMLTextAreaElement>(null);

  const [savedAddrs, setSavedAddrs] = useState<SavedAddress[]>([]);
  const [showSaved, setShowSaved] = useState(false);
  const [geoLoading, setGeoLoading] = useState(false);
  const [pinPos, setPinPos] = useState<LatLng | null>(null);
  const [showMap, setShowMap] = useState(false);

  useEffect(() => {
    setSavedAddrs(getSavedAddresses());
  }, []);

  /** Browse-time zone pre-fills checkout; an explicit pick wins after. */
  const myZoneValid =
    myZoneId && zoneList.some((z) => z.id === myZoneId) ? myZoneId : null;
  const chosenZoneId = zoneList.some((z) => z.id === form.zoneId)
    ? form.zoneId
    : (myZoneValid ?? zoneList[0]?.id ?? "");
  const zone = zoneList.find((z) => z.id === chosenZoneId) ?? zoneList[0];

  const cartKey = `${detail.map((l) => `${l.product.id}|${l.variantLabel}|${l.qty}`).join(",")}|${subtotal}|${chosenZoneId}`;
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
            body: JSON.stringify({ code: appliedCode, items, zoneId: chosenZoneId }),
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
  }, [appliedCode, cartKey, chosenZoneId]);

  const activeCoupon = useMemo(
    () => (couponCheck.code ? { code: couponCheck.code } : null),
    [couponCheck.code],
  );

  // Auto-detect zone from para input
  useEffect(() => {
    if (!form.area.trim()) return;
    const matched = findZoneByPara(form.area.trim());
    if (matched && matched.id !== chosenZoneId) {
      // Only auto-switch if user hasn't manually picked a zone that already contains this para
      const currentZone = zoneList.find((z) => z.id === chosenZoneId);
      const alreadyContains = currentZone?.areas.some(
        (a) => a.toLowerCase() === form.area.trim().toLowerCase(),
      );
      if (!alreadyContains) {
        setForm((f) => ({ ...f, zoneId: matched.id }));
        setMyZoneId(matched.id);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.area]);

  const summary = useMemo(() => {
    if (!zone) {
      return {
        charge: 0,
        fullCharge: 0,
        freeDelivery: false,
        promoFree: false,
        couponFree: false,
        discount: 0,
        total: subtotal,
        itemCount: detail.reduce((n, l) => n + l.qty, 0),
        isOutside: false,
        breakdown: null as any,
        freeThreshold: FREE_DELIVERY_THRESHOLD,
      };
    }
    const distanceKm = pinPos ? distanceFromHubKm(pinPos) : undefined;
    const isNight = settings.nightSurchargeEnabled ? isNightHour(new Date().getHours()) : false;
    const isRain = settings.rainSurchargeEnabled;
    const isExpress = (form.timeSlot === "now" && form.deliveryWindow === "express") || form.deliveryWindow === "express";
    const breakdown = deliveryBreakdown({
      zone,
      subtotal,
      totalOrders: promo.totalOrders,
      distanceKm,
      isNight,
      isRain,
      isExpress: isExpress && settings.expressDeliveryEnabled,
      couponFree: couponFreeDelivery && !!activeCoupon,
      shopPrepMinutes: bagShop?.prepMinutes ?? 15,
      queueCount: 0,
    });
    // Coupon free overrides already in breakdown
    const charge = breakdown.totalCharge;
    const discount = activeCoupon ? couponCheck.discount : 0;
    return {
      charge,
      fullCharge: zone.charge,
      freeDelivery: breakdown.freeDelivery,
      promoFree: breakdown.promoFree,
      couponFree: breakdown.couponFree,
      isPickup: breakdown.isPickup,
      discount,
      tip: (form.tipAmount * 100) as number,
      total: (orderTotal(subtotal, charge, discount) + form.tipAmount * 100) as number,
      itemCount: detail.reduce((n, l) => n + l.qty, 0),
      isOutside: zone?.id === "z4",
      breakdown,
      freeThreshold: freeThresholdForZone(zone.id),
      distanceKm,
      isNight,
      isRain,
    };
  }, [zone, subtotal, detail, activeCoupon, couponCheck.discount, promo, couponFreeDelivery, pinPos, settings, bagShop, form.timeSlot]);

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
    setCouponCheck({ code: null, discount: 0, problem: null });
    setCouponMsg({ ok: true, text: "Checking code…" });
    setAppliedCode(code);
  };

  const handleUseSaved = (addr: SavedAddress) => {
    setForm((f) => ({
      ...f,
      name: addr.name,
      phone: addr.phone,
      area: addr.area,
      houseNo: addr.houseNo,
      roadName: addr.roadName,
      address: addr.fullAddress,
      note: addr.note,
      zoneId: addr.zoneId,
      lat: addr.lat,
      lng: addr.lng,
    }));
    if (addr.lat && addr.lng) setPinPos({ lat: addr.lat, lng: addr.lng });
    setMyZoneId(addr.zoneId);
    setShowSaved(false);
  };

  const handleGeolocate = () => {
    if (!navigator.geolocation) return;
    setGeoLoading(true);
    navigator.geolocation.getCurrentPosition(
      () => {
        // For Sunamganj Sadar, we can't do real distance without map, but we suggest Zone A as nearest to Traffic Point
        setGeoLoading(false);
        const nearest = zoneList.find((z) => z.id === "z1") ?? zoneList[0];
        setForm((f) => ({ ...f, zoneId: nearest.id }));
        setMyZoneId(nearest.id);
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
      else if (firstField === "area") areaRef.current?.focus();
      else if (firstField === "address") addressRef.current?.focus();
    };

    const localErrors: Record<string, string> = {};
    if (form.name.trim().length < 2) localErrors.name = "Please share your full name (at least 2 characters).";
    const phoneClean = form.phone.replace(/[\s\-]/g, "");
    if (!/^(?:\+?88)?01[0-9]{9}$/.test(phoneClean)) {
      localErrors.phone = "A valid Bangladeshi mobile number is required — e.g. 017XXXXXXXX or +88017XXXXXXXX.";
    }
    if (form.area.trim().length < 2) localErrors.area = "Please share your para / neighbourhood — e.g. Boropara, Shologhar.";
    if (form.address.trim().length < 8) localErrors.address = "Please share a full delivery address (house, road, landmark).";
    // Minimum order for outside zone
    if (zone.id === "z4" && subtotal < MIN_ORDER_OUTSIDE_PAISA) {
      localErrors.items = `Zone D (outside Sadar) requires minimum ${formatBdt(MIN_ORDER_OUTSIDE_PAISA)} order — add ${formatBdt(MIN_ORDER_OUTSIDE_PAISA - subtotal)} more.`;
    }
    if (Object.keys(localErrors).length > 0) {
      fail("Please fix the highlighted fields.", localErrors);
      return;
    }

    const buildFullAddress = () => {
      return formatFullAddress({
        houseNo: form.houseNo,
        roadName: form.roadName,
        area: form.area,
        fullAddress: form.address,
        latLng: pinPos,
      });
    };

    const placeLocally = () => {
      const stamp = new Date();
      const date = `${stamp.getFullYear()}${String(stamp.getMonth() + 1).padStart(2, "0")}${String(stamp.getDate()).padStart(2, "0")}`;
      const seq = String(Math.floor(1000 + Math.random() * 9000));
      const orderId = `${ORDER_PREFIX}-${date}-${seq}`;
      const fullAddress = buildFullAddress();
      // Save address for next time
      try {
        saveAddress({
          label: `${form.area} - ${form.name.split(" ")[0]}`,
          name: form.name,
          phone: form.phone,
          area: form.area,
          houseNo: form.houseNo,
          roadName: form.roadName,
          fullAddress: form.address,
          note: form.note,
          zoneId: zone.id,
          lat: pinPos?.lat,
          lng: pinPos?.lng,
        });
      } catch {}
      addOrderToStore(
        makePlacedOrder({
          id: orderId,
          createdAt: stamp.getTime(),
          customer: {
            name: form.name,
            phone: form.phone,
            area: form.area,
            address: fullAddress,
            note: `${form.note} [Slot: ${form.timeSlot}${form.timeSlot === "scheduled" ? ` ${form.deliveryDate} ${form.deliveryWindow}` : ""}]`.trim(),
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
        addressSummary: `${fullAddress}, ${zone.name}`,
      });
      clear();
    };

    let res: Response;
    try {
      const fullAddress = buildFullAddress();
      const scheduledAt = form.timeSlot === "scheduled" ? new Date(`${form.deliveryDate}T${form.deliveryWindow.split("-")[0].padStart(2,"0")}:00:00`).toISOString() : null;
      res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          phone: form.phone,
          area: form.area,
          address: fullAddress,
          note: `${form.note} [Slot: ${form.timeSlot}${form.timeSlot === "scheduled" ? ` ${form.deliveryDate} ${form.deliveryWindow}` : ""}${form.isPickup ? " PICKUP" : ""}]`.trim(),
          zoneId: zone.id,
          lat: pinPos?.lat,
          lng: pinPos?.lng,
          distance_km: summary.distanceKm,
          scheduled_at: scheduledAt,
          delivery_window: form.timeSlot === "scheduled" ? form.deliveryWindow : form.timeSlot,
          is_express: summary.breakdown?.surcharge.express ? true : false,
          is_pickup: form.isPickup,
          tip_amount: form.tipAmount * 100,
          weight_kg: summary.breakdown ? detail.reduce((s,l)=>s+l.qty*0.5,0) : 0,
          surcharge_night: summary.breakdown?.surcharge.night ?? 0,
          surcharge_rain: summary.breakdown?.surcharge.rain ?? 0,
          surcharge_distance: summary.breakdown?.surcharge.distance ?? 0,
          surcharge_express: summary.breakdown?.surcharge.express ?? 0,
          surcharge_weight: summary.breakdown?.surcharge.weight ?? 0,
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
    } catch {}
    const data = (body ?? {}) as {
      demoMode?: boolean;
      order?: Order;
      error?: string;
      errors?: { field: string; message: string }[];
      field?: string;
    };

    if (res.ok && data.demoMode) {
      placeLocally();
      return;
    }
    if (res.ok && data.order) {
      // Save address for next time
      try {
        saveAddress({
          label: `${form.area} - ${form.name.split(" ")[0]}`,
          name: form.name,
          phone: form.phone,
          area: form.area,
          houseNo: form.houseNo,
          roadName: form.roadName,
          fullAddress: form.address,
          note: form.note,
          zoneId: zone.id,
          lat: pinPos?.lat,
          lng: pinPos?.lng,
        });
      } catch {}
      addOrderToStore(data.order);
      setPlaced({
        orderId: data.order.id,
        eta: data.order.etaLabel,
        charge: data.order.deliveryCharge,
        total: data.order.total,
        addressSummary: `${form.address || form.area}, ${data.order.zoneName}`,
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
        "Could not place the order — please try again. Your cart is untouched.",
      Object.keys(fieldMap).length > 0 ? fieldMap : undefined,
    );
  };

  const areaOptions = getParaSuggestions(form.area, 10);
  const roadOptions = ROAD_NAMES;

  return (
    <div className="grid gap-12 lg:grid-cols-[1fr_400px]">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          placeOrder();
        }}
        className="min-w-0"
      >
        {/* Real-time promo banner */}
        <div className="mb-8 rounded-2xl bg-gradient-to-r from-forest-800 to-forest-900 p-4 text-ivory-50 ring-1 ring-forest-700">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gold-400 text-forest-900">
              <IconGift className="h-4 w-4" />
            </span>
            <div className="flex-1">
              {promo.loading ? (
                <p className="text-sm font-bold">🎉 প্রথম ১০০০ অর্ডারে ডেলিভারি ফ্রি!</p>
              ) : promo.promoActive ? (
                <>
                  <p className="text-sm font-bold">
                    🎉 প্রথম {promo.limit} অর্ডারে ডেলিভারি ফ্রি! {promo.remainingFree} টা বাকি
                  </p>
                  <div className="mt-1.5 h-1.5 w-full rounded-full bg-white/20">
                    <div
                      className="h-1.5 rounded-full bg-gold-400 transition-all"
                      style={{ width: `${Math.max(5, (promo.totalOrders / promo.limit) * 100)}%` }}
                    />
                  </div>
                  <p className="text-[11px] text-ivory-100/70 mt-1">
                    {promo.totalOrders}/{promo.limit} claimed — এখন অর্ডার করলে ফ্রি পাবেন!
                  </p>
                </>
              ) : (
                <p className="text-sm font-bold">🎉 প্রথম {promo.limit} ফ্রি শেষ — এখন ৳1000+ অর্ডারে ফ্রি!</p>
              )}
              <p className="text-xs text-ivory-100/80 mt-1">
                জায়গা অনুযায়ী: Zone A ৳30, Zone B ৳50, Zone C ৳70, বাইরে ৳100 · ৳1000+ অর্ডারে সবসময় ফ্রি
              </p>
            </div>
          </div>
        </div>

        {/* District / Upazila + Geolocate */}
        <div className="mb-6 grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-ivory-100 px-4 py-3 ring-1 ring-line">
            <p className="text-[11px] font-bold uppercase tracking-wider text-ink-soft">জেলা (District)</p>
            <p className="mt-1 text-sm font-semibold text-forest-900">{DISTRICT}</p>
          </div>
          <div className="rounded-xl bg-ivory-100 px-4 py-3 ring-1 ring-line">
            <p className="text-[11px] font-bold uppercase tracking-wider text-ink-soft">উপজেলা (Upazila)</p>
            <p className="mt-1 text-sm font-semibold text-forest-900">{UPAZILA}</p>
          </div>
        </div>
        <div className="mb-6 flex gap-2">
          <button
            type="button"
            onClick={handleGeolocate}
            disabled={geoLoading}
            className="inline-flex items-center gap-1.5 rounded-full bg-paper px-4 py-2 text-xs font-medium ring-1 ring-line hover:bg-ivory-100"
          >
            <IconMapPin className="h-3.5 w-3.5" />
            {geoLoading ? "Locating..." : "Use my location — auto zone"}
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
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-ink">
                {t("checkout.fullName")} <span className="text-rose-600">*</span>
              </span>
              <input
                ref={nameRef}
                required
                value={form.name}
                onChange={(e) => {
                  update("name", e.target.value);
                  if (fieldErrors.name) setFieldErrors((f) => ({ ...f, name: "" }));
                }}
                placeholder="e.g. Rahat Ahmed"
                aria-invalid={!!fieldErrors.name}
                aria-describedby={fieldErrors.name ? "err-name" : undefined}
                className={`h-12 w-full rounded-2xl bg-paper px-4 text-sm text-ink ring-1 placeholder:text-ink-soft/50 focus:ring-2 focus:ring-forest-500 ${fieldErrors.name ? "ring-rose-300 bg-rose-50/50" : "ring-line"}`}
              />
              {fieldErrors.name && (
                <p id="err-name" className="mt-1.5 text-xs text-rose-700">{fieldErrors.name}</p>
              )}
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-ink">
                {t("checkout.phoneNumber")} <span className="text-rose-600">*</span>
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
                placeholder="017XXXXXXXX or +88017XXXXXXXX"
                aria-invalid={!!fieldErrors.phone}
                aria-describedby={fieldErrors.phone ? "err-phone" : undefined}
                className={`h-12 w-full rounded-2xl bg-paper px-4 text-sm text-ink ring-1 placeholder:text-ink-soft/50 focus:ring-2 focus:ring-forest-500 ${fieldErrors.phone ? "ring-rose-300 bg-rose-50/50" : "ring-line"}`}
              />
              {fieldErrors.phone ? (
                <p id="err-phone" className="mt-1.5 text-xs text-rose-700">{fieldErrors.phone}</p>
              ) : (
                <p className="mt-1 text-[11px] text-ink-soft">Spaces and dashes are okay — we’ll normalize it.</p>
              )}
            </label>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-ink">
                {t("checkout.deliveryArea")} <span className="text-rose-600">*</span>
              </span>
              <select
                required
                value={zone.id}
                onChange={(e) => {
                  update("zoneId", e.target.value);
                  setMyZoneId(e.target.value);
                  if (fieldErrors.zoneId) setFieldErrors((f) => ({ ...f, zoneId: "" }));
                }}
                aria-invalid={!!fieldErrors.zoneId}
                className={`h-12 w-full rounded-2xl bg-paper px-4 text-sm text-ink ring-1 focus:ring-2 focus:ring-forest-500 ${fieldErrors.zoneId ? "ring-rose-300 bg-rose-50/50" : "ring-line"}`}
              >
                {zoneList.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.name} — {formatBdt(z.charge)} · {z.etaLabel}
                  </option>
                ))}
              </select>
              {fieldErrors.zoneId && (
                <p className="mt-1.5 text-xs text-rose-700">{fieldErrors.zoneId}</p>
              )}
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-ink">
                পাড়া / Area <span className="text-rose-600">*</span>
              </span>
              <input
                ref={areaRef}
                required
                list="prosanti-areas"
                value={form.area}
                onChange={(e) => {
                  update("area", e.target.value);
                  if (fieldErrors.area) setFieldErrors((f) => ({ ...f, area: "" }));
                }}
                placeholder="e.g. Boropara, Shologhar, Notunpara"
                aria-invalid={!!fieldErrors.area}
                aria-describedby={fieldErrors.area ? "err-area" : "hint-area"}
                className={`h-12 w-full rounded-2xl bg-paper px-4 text-sm text-ink ring-1 placeholder:text-ink-soft/50 focus:ring-2 focus:ring-forest-500 ${fieldErrors.area ? "ring-rose-300 bg-rose-50/50" : "ring-line"}`}
              />
              <datalist id="prosanti-areas">
                {areaOptions.map((a) => (
                  <option key={a} value={a} />
                ))}
                {ALL_PARAS.map((a) => (
                  <option key={`all-${a}`} value={a} />
                ))}
              </datalist>
              {fieldErrors.area ? (
                <p id="err-area" className="mt-1.5 text-xs text-rose-700">{fieldErrors.area}</p>
              ) : (
                <p id="hint-area" className="mt-1 text-[11px] text-ink-soft">
                  Auto zone: {findZoneByPara(form.area)?.name ?? zone.name} · Suggested: {zone.areas.slice(0, 3).join(", ")}
                </p>
              )}
            </label>
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
                {roadOptions.map((r) => (
                  <option key={r} value={r} />
                ))}
              </datalist>
            </label>
          </div>

          {/* Map Pin Picker - Sunamganj real geo */}
          <div className="mt-6">
            <div className="flex items-center justify-between">
              <span className="mb-2 block text-sm font-medium text-ink">
                📍 ম্যাপে বাড়ি সিলেক্ট করুন / Pin your house
              </span>
              <button
                type="button"
                onClick={() => setShowMap((v) => !v)}
                className="mb-2 rounded-full bg-forest-800 px-3 py-1 text-xs font-semibold text-white"
              >
                {showMap ? "Hide Map" : "Show Map — auto zone"}
              </button>
            </div>
            {showMap && (
              <MapPinPicker
                value={pinPos}
                onChange={(pos) => {
                  setPinPos(pos);
                  setForm((f) => ({ ...f, lat: pos.lat, lng: pos.lng }));
                  const autoZone = findZoneByDistance(pos);
                  const dist = distanceFromHubKm(pos);
                  // Auto switch zone if far from current
                  if (autoZone.id !== zone.id) {
                    setForm((f) => ({ ...f, zoneId: autoZone.id }));
                    setMyZoneId(autoZone.id);
                  }
                }}
                onZoneDetected={(zId, distKm) => {
                  // Zone detected callback
                }}
              />
            )}
            {pinPos && (
              <p className="mt-2 text-xs text-forest-700 font-medium">
                📌 Pin: {pinPos.lat.toFixed(5)}, {pinPos.lng.toFixed(5)} · {distanceFromHubKm(pinPos).toFixed(2)} km from Traffic Point · Zone: {findZoneByDistance(pinPos).name}
              </p>
            )}
          </div>

          <label className="mt-4 block">
            <span className="mb-1.5 block text-sm font-medium text-ink">
              বিস্তারিত ঠিকানা / Full Address <span className="text-rose-600">*</span>
            </span>
            <textarea
              ref={addressRef}
              required
              rows={3}
              value={form.address}
              onChange={(e) => {
                update("address", e.target.value);
                if (fieldErrors.address) setFieldErrors((f) => ({ ...f, address: "" }));
              }}
              placeholder="বাড়ির নম্বর, পাড়ার নাম, রোড, ল্যান্ডমার্ক, ফ্লোর — যেমন: House 12, Boropara, College Road, 2nd floor, near Mosque"
              aria-invalid={!!fieldErrors.address}
              aria-describedby={fieldErrors.address ? "err-address" : "hint-full-address"}
              className={`w-full rounded-2xl bg-paper px-4 py-3 text-sm text-ink ring-1 placeholder:text-ink-soft/50 focus:ring-2 focus:ring-forest-500 ${fieldErrors.address ? "ring-rose-300 bg-rose-50/50" : "ring-line"}`}
            />
            {fieldErrors.address ? (
              <p id="err-address" className="mt-1.5 text-xs text-rose-700">{fieldErrors.address}</p>
            ) : (
              <p id="hint-full-address" className="mt-1.5 text-[11px] text-ink-soft">
                পাড়া ({form.area || "Boropara"}) + বাড়ি + রোড + ল্যান্ডমার্ক লিখুন। জেলা: {DISTRICT}, উপজেলা: {UPAZILA} অটো যোগ হবে।
              </p>
            )}
          </label>

          <label className="mt-4 block">
            <span className="mb-1.5 block text-sm font-medium text-ink">
              {t("checkout.orderNote")}{" "}
              <span className="font-normal text-ink-soft">{t("checkout.optional")}</span>
            </span>
            <input
              value={form.note}
              onChange={(e) => update("note", e.target.value)}
              placeholder="e.g. Call before arriving, near Mosque"
              className="h-12 w-full rounded-2xl bg-paper px-4 text-sm text-ink ring-1 ring-line placeholder:text-ink-soft/50 focus:ring-2 focus:ring-forest-500"
            />
          </label>

          {/* Delivery Time Slot - Scheduled Calendar */}
          <div className="mt-6 space-y-3">
            <span className="mb-2 block text-sm font-medium text-ink">ডেলিভারি সময় / Delivery Slot — Scheduled Calendar</span>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: "now" as TimeSlot, label: "এখনই", sub: `${summary.breakdown?.eta ?? "30-50 min"}`, icon: "⚡" },
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
                      min={new Date().toISOString().slice(0,10)}
                      max={new Date(Date.now()+3*86400000).toISOString().slice(0,10)}
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
                      <option value="express">⚡ Express 30min (+৳40)</option>
                    </select>
                  </label>
                </div>
                <p className="text-[11px] text-ink-soft">
                  Scheduled delivery: {form.deliveryDate} {form.deliveryWindow} · Shop will prepare accordingly. Express adds {formatBdt(4000)}.
                </p>
              </div>
            )}
          </div>
        </section>

        {/* Delivery estimate - Dynamic ETA + surcharges */}
        <section className="mt-10">
          <h2 className="font-display text-xl font-medium text-forest-900">
            {t("checkout.deliveryEstimate")} — Dynamic
          </h2>
          <div className="mt-5 flex items-start gap-4 rounded-2xl bg-forest-900 p-5 text-ivory-100">
            <IconTruck className="mt-0.5 h-6 w-6 shrink-0 text-gold-300" />
            <div className="text-sm leading-6 flex-1">
              <p className="font-semibold">{zone.name} {summary.distanceKm ? `· ${summary.distanceKm.toFixed(2)}km from hub` : ""}</p>
              {bagShop && (
                <p className="mt-1 text-ivory-100/70">
                  {t("shops.checkoutEta")}: {bagShop.name} · Prep {bagShop.prepMinutes}min + Delivery ·{" "}
                  <strong className="text-gold-300">
                    {summary.breakdown?.eta ?? zone.etaLabel}
                  </strong>
                  {summary.breakdown && summary.breakdown.etaMinutes !== parseInt(zone.etaLabel) && (
                    <span className="ml-2 text-[11px] bg-gold-400 text-forest-900 px-2 py-0.5 rounded-full">Dynamic ETA</span>
                  )}
                </p>
              )}
              <p className="mt-1 text-ivory-100/70">
                {INSTANT_DELIVERY_TITLE} — estimated arrival{" "}
                <strong className="text-gold-300">{summary.breakdown?.eta ?? zone.etaLabel}</strong> from
                confirmation · Delivery charge{" "}
                <strong>
                  {summary.freeDelivery ? (
                    <span className="text-gold-300">
                      {summary.couponFree ? "FREE — Coupon 🚚" : summary.promoFree ? "FREE (First 1000 promo) 🎉" : "Free"}
                    </span>
                  ) : (
                    formatBdt(summary.charge)
                  )}
                </strong>
                {summary.breakdown?.surcharge.total ? (
                  <span className="block mt-1 text-xs text-amber-200">
                    Base {formatBdt(summary.fullCharge)}
                    {summary.breakdown.surcharge.distance ? ` + Distance ${formatBdt(summary.breakdown.surcharge.distance)}` : ""}
                    {summary.breakdown.surcharge.night ? ` + Night ${formatBdt(summary.breakdown.surcharge.night)}` : ""}
                    {summary.breakdown.surcharge.rain ? ` + Rain ${formatBdt(summary.breakdown.surcharge.rain)}` : ""}
                  </span>
                ) : null}
                {summary.isOutside && (
                  <span className="block mt-1 text-xs text-amber-200">
                    Zone D: Sunamganj Sadar বাইরে — minimum {formatBdt(MIN_ORDER_OUTSIDE_PAISA)} required
                  </span>
                )}
                {summary.isNight && !summary.freeDelivery && (
                  <span className="block mt-1 text-xs text-gold-300">🌙 Night surcharge +{formatBdt(NIGHT_SURCHARGE_PAISA)} (9PM-6AM)</span>
                )}
                {summary.isRain && !summary.freeDelivery && (
                  <span className="block mt-1 text-xs text-sky-300">🌧️ Rain surcharge +{formatBdt(RAIN_SURCHARGE_PAISA)}</span>
                )}
                <span className="block mt-1 text-xs text-ivory-100/60">
                  Free delivery at {formatBdt(summary.freeThreshold)} for {zone.name} · {formatBdt(summary.freeThreshold - subtotal > 0 ? summary.freeThreshold - subtotal : 0)} more needed
                </span>
              </p>
            </div>
          </div>
        </section>

        {/* Pickup + Tips */}
        <section className="mt-10 space-y-4">
          <h2 className="font-display text-xl font-medium text-forest-900">Pickup & Tips — Cloudinary proof already</h2>
          <div className="flex flex-wrap gap-3">
            <label className="flex items-center gap-2 rounded-2xl bg-paper px-4 py-3 ring-1 ring-line cursor-pointer">
              <input type="checkbox" checked={form.isPickup} onChange={(e) => update("isPickup", e.target.checked)} className="h-4 w-4" />
              <span className="text-sm font-medium">🏪 Store Pickup at Traffic Point — Free, no delivery charge</span>
            </label>
          </div>
          <div>
            <p className="text-sm font-medium mb-2">💝 Tip for Rider (optional) — 100% goes to rider</p>
            <div className="flex flex-wrap gap-2">
              {[0,10,20,30,50].map((tip) => (
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
            {form.tipAmount > 0 && <p className="mt-2 text-xs text-forest-700">Thank you! ৳{form.tipAmount} will go to your rider via Cloudinary-tracked settlement.</p>}
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
                  {t("checkout.cashOnDeliveryText")} — Sunamganj Sadar COD
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
            {INSTANT_DELIVERY_TITLE} — Sunamganj Sadar · Traffic Point
          </p>
          {promo.promoActive && !promo.loading && (
            <p className="mt-2 rounded-xl bg-gold-50 px-3 py-2 text-xs font-bold text-forest-900 ring-1 ring-gold-200">
              🎉 {promo.remainingFree} free deliveries left of {promo.limit}!
            </p>
          )}
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
          {/* Coupon */}
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
              <dt className="text-ink-soft">{t("checkout.delivery")} · {summary.breakdown?.eta ?? zone.etaLabel}</dt>
              <dd className="font-medium text-ink">
                {summary.freeDelivery ? (
                  <span className="text-forest-700">
                    {summary.couponFree ? "FREE 🚚 Coupon" : summary.promoFree ? "FREE 🎉" : "Free"}{" "}
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
              </div>
            )}
            {!summary.freeDelivery && subtotal < summary.freeThreshold && !promo.promoActive && (
              <p className="rounded-xl bg-ivory-100 px-3 py-2 text-xs leading-5 text-ink-soft">
                {formatBdt(summary.freeThreshold - subtotal)} more unlocks free delivery for {zone.name} (threshold {formatBdt(summary.freeThreshold)}).
              </p>
            )}
            {summary.couponFree && (
              <p className="rounded-xl bg-forest-50 px-3 py-2 text-xs leading-5 text-forest-900 ring-1 ring-forest-200">
                🚚 Free delivery coupon applied — {activeCoupon?.code}
              </p>
            )}
            {summary.promoFree && (
              <p className="rounded-xl bg-gold-50 px-3 py-2 text-xs leading-5 text-forest-900 ring-1 ring-gold-200">
                🎉 First {FIRST_1000_FREE_LIMIT} promo — delivery free! {promo.remainingFree} left.
              </p>
            )}
            {(summary as any).tip > 0 && (
              <div className="flex justify-between">
                <dt className="text-ink-soft">💝 Tip for Rider</dt>
                <dd className="font-medium text-forest-700">+{formatBdt((summary as any).tip)}</dd>
              </div>
            )}
            {summary.isPickup && (
              <p className="rounded-xl bg-sky-50 px-3 py-2 text-xs text-sky-900 ring-1 ring-sky-200">🏪 Pickup at Traffic Point — no delivery, ready in {bagShop?.prepMinutes ?? 15} min</p>
            )}
            <div className="flex justify-between pt-2 text-base">
              <dt className="font-semibold text-ink">{t("checkout.totalCod")}{summary.isPickup ? " (Pickup)" : ""}</dt>
              <dd className="font-bold text-ink">{formatBdt(summary.total)}</dd>
            </div>
          </dl>
          <p className="mt-5 flex items-start gap-2 rounded-xl bg-ivory-100 px-3.5 py-3 text-xs leading-5 text-ink-soft">
            <IconBox className="mt-0.5 h-4 w-4 shrink-0 text-forest-700" />
            {t("checkout.followOrderHint")} — Sunamganj Sadar COD, PIN required.
          </p>
        </div>
      </aside>
    </div>
  );
}
