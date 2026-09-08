"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useCart } from "@/components/cart/cart-provider";
import { useZones } from "@/lib/use-zones";
import { useCoupons } from "@/lib/use-coupons";
import {
  discountAmount,
  eligibleSubtotal,
  findCoupon,
  isCouponRedeemable,
  type Coupon,
} from "@/lib/coupons";
import { ORDER_PREFIX } from "@/lib/catalog";
import { makePlacedOrder } from "@/lib/orders";
import { addOrderToStore } from "@/lib/order-store";
import { formatBdt } from "@/lib/format";
import {
  IconArrowRight,
  IconBag,
  IconBox,
  IconCheck,
  IconMapPin,
  IconTruck,
} from "@/components/ui/icons";

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
  const { detail, subtotal, clear } = useCart();
  /** Delivery zones come from the shared store — admin edits show here (§20). */
  const { activeZones: zoneList } = useZones();
  const [form, setForm] = useState<FormState>(initialForm);
  const [placed, setPlaced] = useState<{
    orderId: string;
    eta: string;
    charge: number;
    total: number;
    addressSummary: string;
  } | null>(null);

  const { coupons: allCoupons, recordUse } = useCoupons();
  const [appliedCoupon, setAppliedCoupon] = useState<Coupon | null>(null);
  const [couponMsg, setCouponMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const chosenZoneId = zoneList.some((z) => z.id === form.zoneId)
    ? form.zoneId
    : (zoneList[0]?.id ?? "");
  const zone = zoneList.find((z) => z.id === chosenZoneId) ?? zoneList[0];

  const summary = useMemo(() => {
    const charge = zone?.charge ?? 0;
    const discount = appliedCoupon
      ? discountAmount(
          appliedCoupon,
          eligibleSubtotal(
            appliedCoupon,
            detail.map((l) => ({
              productCategory: l.product.category,
              subtotal: l.lineTotal,
            })),
          ),
        )
      : 0;
    return {
      charge,
      discount,
      total: subtotal + charge - discount,
      itemCount: detail.reduce((n, l) => n + l.qty, 0),
    };
  }, [zone, subtotal, detail, appliedCoupon]);

  const empty = detail.length === 0;

  if (placed) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16 text-center">
        <span className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-forest-100 text-forest-800">
          <IconCheck className="h-9 w-9" />
        </span>
        <p className="font-bengali mt-8 text-sm text-ink-soft">
          অর্ডার নিশ্চিত হয়েছে — ধন্যবাদ
        </p>
        <h1 className="font-display mt-2 text-3xl font-medium text-forest-900 sm:text-4xl">
          Order confirmed
        </h1>
        <p className="mt-4 text-ink-soft">
          Order <strong className="text-ink">{placed.orderId}</strong> — thank
          you{form.name ? `, ${form.name.split(" ")[0]}` : ""}. We are preparing
          your delivery now.
        </p>
        <div className="mx-auto mt-8 max-w-sm space-y-3 rounded-3xl bg-paper p-6 text-left text-sm ring-1 ring-line">
          <p className="flex items-center gap-3">
            <IconTruck className="h-5 w-5 text-forest-700" />
            Estimated arrival:{" "}
            <strong className="text-ink">{placed.eta}</strong>
          </p>
          <p className="flex items-center gap-3">
            <IconMapPin className="h-5 w-5 text-forest-700" />
            <span className="text-ink-soft">{placed.addressSummary}</span>
          </p>
          <p className="flex items-center justify-between border-t border-line pt-3 font-medium text-ink">
            Total payable (Cash on Delivery)
            <span>{formatBdt(placed.total)}</span>
          </p>
        </div>
        <div className="mt-9 flex flex-wrap items-center justify-center gap-4">
          <Link
            href="/track"
            className="inline-flex h-12 items-center gap-2 rounded-full bg-forest-800 px-7 text-sm font-semibold text-ivory-50 transition-colors hover:bg-forest-700"
          >
            Track this order <IconArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="/shop"
            className="inline-flex h-12 items-center rounded-full bg-paper px-7 text-sm font-medium ring-1 ring-line"
          >
            Continue shopping
          </Link>
        </div>
        <p className="mt-8 text-xs text-ink-soft/70">
          A confirmation will also arrive by SMS once messaging is enabled.
          Tracking with this order ID and your phone number works on the Track
          page.
        </p>
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
          Nothing to check out yet
        </h2>
        <p className="mt-2 text-sm text-ink-soft">
          Add a product to your cart first, then come back here.
        </p>
        <Link
          href="/shop"
          className="mt-7 inline-flex h-12 items-center gap-2 rounded-full bg-forest-800 px-7 text-sm font-semibold text-ivory-50 transition-colors hover:bg-forest-700"
        >
          Explore products <IconArrowRight className="h-4 w-4" />
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
    const coupon = findCoupon(allCoupons, code);
    if (!coupon) {
      setAppliedCoupon(null);
      setCouponMsg({ ok: false, text: "Unknown code — double-check the spelling." });
      return;
    }
    const check = isCouponRedeemable(coupon, subtotal);
    if (!check.ok) {
      setAppliedCoupon(null);
      setCouponMsg({ ok: false, text: check.reason ?? "This code cannot be used." });
      return;
    }
    setAppliedCoupon(coupon);
    setCouponMsg({ ok: true, text: `${coupon.code} applied — discount shown below.` });
  };

  const placeOrder = () => {
    if (form.submitting) return; // idempotent — no double submission (§79)
    update("submitting", true);
    const stamp = new Date();
    const date = `${stamp.getFullYear()}${String(stamp.getMonth() + 1).padStart(2, "0")}${String(stamp.getDate()).padStart(2, "0")}`;
    const seq = String(Math.floor(1000 + Math.random() * 9000));
    const orderId = `${ORDER_PREFIX}-${date}-${seq}`;
    // Simulated network/backend latency before showing confirmation.
    window.setTimeout(() => {
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
          zone: { id: zone.id, name: zone.name, etaLabel: zone.etaLabel, charge: zone.charge },
          items: detail.map((l) => ({
            product: l.product,
            image: l.product.media[0]?.src ?? "",
            variant: l.variantLabel,
            qty: l.qty,
          })),
          coupon: appliedCoupon
            ? { code: appliedCoupon.code, discount: summary.discount }
            : undefined,
        }),
      );
      if (appliedCoupon) recordUse(appliedCoupon.code);
      setPlaced({
        orderId,
        eta: zone.etaLabel,
        charge: summary.charge,
        total: summary.total,
        addressSummary: `${form.address || form.area}, ${zone.name}`,
      });
      clear();
    }, 900);
  };

  const areaOptions = zone.areas.map((a) => `${a} · ${zone.name}`);

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
            1 · Delivery details
          </h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-ink">
                Full name
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
                Phone number
              </span>
              <input
                required
                type="tel"
                inputMode="tel"
                pattern="01[0-9]{9}"
                title="A valid Bangladeshi mobile number, e.g. 017XXXXXXXX"
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
                Delivery area
              </span>
              <select
                required
                value={zone.id}
                onChange={(e) => update("zoneId", e.target.value)}
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
                Area / neighbourhood
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
              Full address
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
              Order note <span className="font-normal text-ink-soft">(optional)</span>
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
            2 · Delivery estimate
          </h2>
          <div className="mt-5 flex items-start gap-4 rounded-2xl bg-forest-900 p-5 text-ivory-100">
            <IconTruck className="mt-0.5 h-6 w-6 shrink-0 text-gold-300" />
            <div className="text-sm leading-6">
              <p className="font-semibold">{zone.name}</p>
              <p className="mt-1 text-ivory-100/70">
                Estimated arrival{" "}
                <strong className="text-gold-300">{zone.etaLabel}</strong> from
                confirmation · Delivery charge{" "}
                <strong>{formatBdt(zone.charge)}</strong>
              </p>
            </div>
          </div>
        </section>

        {/* Payment */}
        <section className="mt-10">
          <h2 className="font-display text-xl font-medium text-forest-900">
            3 · Payment method
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
                  Cash on Delivery
                </span>
                <span className="mt-0.5 block text-xs leading-5 text-ink-soft">
                  Pay in cash when your order arrives. Available inside the
                  service area.
                </span>
              </span>
              <span className="rounded-full bg-ivory-100 px-3 py-1 text-xs font-semibold text-forest-800 ring-1 ring-line">
                Primary
              </span>
            </label>
            <div className="flex items-center gap-4 rounded-2xl border border-dashed border-line bg-ivory-100/60 p-5 opacity-70">
              <input type="radio" disabled className="h-4 w-4 accent-forest-700" />
              <span className="flex-1">
                <span className="block text-sm font-medium text-ink">
                  bKash / Nagad / Cards{" "}
                  <span className="ml-1 rounded-full bg-gold-200 px-2.5 py-0.5 text-[0.65rem] font-bold uppercase tracking-wide text-gold-700">
                    Soon
                  </span>
                </span>
                <span className="mt-0.5 block text-xs text-ink-soft">
                  Online payments arrive with the payment-gateway phase.
                </span>
              </span>
            </div>
          </div>
        </section>

        <button
          type="submit"
          disabled={form.submitting}
          className="mt-10 inline-flex h-14 w-full items-center justify-center gap-2 rounded-full bg-forest-800 text-sm font-semibold text-ivory-50 transition-colors hover:bg-forest-700 disabled:opacity-60 sm:w-auto sm:px-10"
        >
          {form.submitting ? "Placing your order…" : "Place Order"}
          {!form.submitting && <IconArrowRight className="h-4 w-4" />}
        </button>
        <p className="mt-4 text-xs leading-5 text-ink-soft/80">
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
            Your order
          </h2>
          <ul className="mt-5 space-y-4">
            {detail.map((line) => (
              <li key={line.product.id + line.variantLabel} className="flex gap-4">
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
              Have a coupon code?
            </label>
            {appliedCoupon ? (
              <div className="flex items-center justify-between rounded-xl bg-forest-50 px-3.5 py-2.5 text-sm ring-1 ring-forest-200">
                <span className="font-mono font-bold text-forest-800">
                  {appliedCoupon.code}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setAppliedCoupon(null);
                    setCouponMsg(null);
                    update("couponCode", "");
                  }}
                  className="text-xs font-semibold text-ink-soft underline underline-offset-2 hover:text-rose-700"
                >
                  Remove
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <input
                  value={form.couponCode}
                  onChange={(e) => update("couponCode", e.target.value.toUpperCase())}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), applyCoupon())}
                  placeholder="e.g. WELCOME100"
                  aria-label="Coupon code"
                  className="h-11 w-full min-w-0 rounded-xl bg-ivory-50 px-3.5 text-sm uppercase tracking-wide text-ink ring-1 ring-line placeholder:normal-case placeholder:tracking-normal placeholder:text-ink-soft/50 focus:ring-2 focus:ring-forest-500"
                />
                <button
                  type="button"
                  onClick={applyCoupon}
                  className="shrink-0 rounded-xl bg-forest-800 px-4 text-xs font-semibold text-ivory-50 transition-colors hover:bg-forest-700"
                >
                  Apply
                </button>
              </div>
            )}
            {couponMsg && (
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
              <dt className="text-ink-soft">Subtotal</dt>
              <dd className="font-medium text-ink">{formatBdt(subtotal)}</dd>
            </div>
            {summary.discount > 0 && appliedCoupon && (
              <div className="flex justify-between">
                <dt className="text-ink-soft">
                  Coupon · {appliedCoupon.code}
                </dt>
                <dd className="font-medium text-emerald-700">
                  −{formatBdt(summary.discount)}
                </dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="text-ink-soft">
                Delivery · {zone.etaLabel}
              </dt>
              <dd className="font-medium text-ink">
                {formatBdt(summary.charge)}
              </dd>
            </div>
            <div className="flex justify-between pt-2 text-base">
              <dt className="font-semibold text-ink">Total (COD)</dt>
              <dd className="font-bold text-ink">{formatBdt(summary.total)}</dd>
            </div>
          </dl>
          <p className="mt-5 flex items-start gap-2 rounded-xl bg-ivory-100 px-3.5 py-3 text-xs leading-5 text-ink-soft">
            <IconBox className="mt-0.5 h-4 w-4 shrink-0 text-forest-700" />
            You will be able to follow this order on the Track page — no
            account needed, just the order ID and phone number.
          </p>
        </div>
      </aside>
    </div>
  );
}
