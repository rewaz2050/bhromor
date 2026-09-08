"use client";

import { useState } from "react";
import { IconBox, IconCheck, IconMapPin, IconPhone, IconSearch } from "@/components/ui/icons";

const DEMO_ORDER = "PS-20260908-1042";

const STEPS = [
  { key: "placed", label: "Order Placed", note: "Confirmed receipt of your order" },
  { key: "confirmed", label: "Order Confirmed", note: "Stock reserved & payment method verified" },
  { key: "preparing", label: "Preparing", note: "Being quality-checked & packed" },
  { key: "assigned", label: "Courier Assigned", note: "A rider is on the way to collect" },
  { key: "out", label: "Out for Delivery", note: "Your order is on the move" },
  { key: "delivered", label: "Delivered", note: "Enjoy — thank you for shopping with PROSANTI" },
] as const;

const DEMO_PROGRESS = 4; // index of the active step (0-based)

export default function TrackView() {
  const [orderId, setOrderId] = useState("");
  const [phone, setPhone] = useState("");
  const [searched, setSearched] = useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setSearched(true);
  };

  const activeIndex = Math.min(DEMO_PROGRESS, STEPS.length - 1);

  return (
    <div className="grid gap-10 lg:grid-cols-[420px_1fr]">
      {/* Lookup */}
      <form
        onSubmit={submit}
        className="h-fit rounded-3xl bg-paper p-7 ring-1 ring-line lg:sticky lg:top-28"
      >
        <h2 className="font-display text-2xl font-medium text-forest-900">
          Track your order
        </h2>
        <p className="mt-2 text-sm leading-6 text-ink-soft">
          No account needed — enter the order ID from your confirmation and the
          phone number you ordered with.
        </p>
        <label className="mt-6 block">
          <span className="mb-1.5 block text-sm font-medium text-ink">
            Order ID
          </span>
          <div className="relative">
            <IconBox className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" />
            <input
              required
              value={orderId}
              onChange={(e) => setOrderId(e.target.value)}
              placeholder={`e.g. ${DEMO_ORDER}`}
              className="h-12 w-full rounded-2xl bg-ivory-50 pl-11 pr-4 text-sm text-ink ring-1 ring-line placeholder:text-ink-soft/50 focus:ring-2 focus:ring-forest-500"
            />
          </div>
        </label>
        <label className="mt-4 block">
          <span className="mb-1.5 block text-sm font-medium text-ink">
            Phone number
          </span>
          <div className="relative">
            <IconPhone className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" />
            <input
              required
              type="tel"
              inputMode="tel"
              pattern="01[0-9]{9}"
              title="A valid Bangladeshi mobile number"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="017XXXXXXXX"
              className="h-12 w-full rounded-2xl bg-ivory-50 pl-11 pr-4 text-sm text-ink ring-1 ring-line placeholder:text-ink-soft/50 focus:ring-2 focus:ring-forest-500"
            />
          </div>
        </label>
        <button
          type="submit"
          className="mt-6 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-forest-800 text-sm font-semibold text-ivory-50 transition-colors hover:bg-forest-700"
        >
          <IconSearch className="h-4 w-4" /> Track order
        </button>
        <button
          type="button"
          onClick={() => {
            setOrderId(DEMO_ORDER);
            setPhone("01712345678");
            setSearched(true);
          }}
          className="mt-3 w-full text-center text-xs text-ink-soft underline underline-offset-4 hover:text-forest-700"
        >
          View the demo order instead
        </button>
      </form>

      {/* Result */}
      <div>
        {!searched ? (
          <div className="flex h-full min-h-[320px] flex-col items-center justify-center rounded-3xl border border-dashed border-line bg-ivory-100/50 px-8 text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-paper text-forest-700 ring-1 ring-line">
              <IconMapPin className="h-7 w-7" />
            </span>
            <h2 className="font-display mt-6 text-2xl font-medium text-forest-900">
              Where is my order?
            </h2>
            <p className="mt-2 max-w-sm text-sm leading-6 text-ink-soft">
              Enter your details to see the live timeline — confirmation,
              preparation, courier assignment and delivery.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Header card */}
            <div className="rounded-3xl bg-forest-900 p-7 text-ivory-100">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.3em] text-gold-300">
                    Live order
                  </p>
                  <p className="font-display mt-1.5 text-2xl font-medium">
                    {orderId || DEMO_ORDER}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-ivory-100/60">Estimated arrival</p>
                  <p className="mt-0.5 text-2xl font-semibold text-gold-300">
                    18–25 min
                  </p>
                </div>
              </div>
              {/* Mock live map */}
              <div className="relative mt-6 h-44 overflow-hidden rounded-2xl bg-forest-800">
                <svg viewBox="0 0 400 176" className="h-full w-full" aria-hidden="true">
                  <path
                    d="M-10 140 C60 120 120 60 200 66 S330 90 410 40"
                    fill="none"
                    stroke="#86ad97"
                    strokeWidth="2.5"
                    strokeDasharray="1 9"
                    strokeLinecap="round"
                    opacity="0.9"
                  />
                  <path
                    d="M-10 158 C90 140 170 120 260 122 S360 130 410 112"
                    fill="none"
                    stroke="#86ad97"
                    strokeWidth="2"
                    strokeDasharray="1 9"
                    strokeLinecap="round"
                    opacity="0.6"
                  />
                </svg>
                <span className="absolute left-1/2 top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 animate-pulse rounded-full bg-gold-400 ring-4 ring-gold-400/30" />
                <span className="absolute bottom-3 right-4 rounded-full bg-forest-950/70 px-3 py-1 text-[0.65rem] font-medium text-ivory-100/80">
                  Demo view — live courier map arrives with the tracking phase
                </span>
              </div>
            </div>

            {/* Timeline */}
            <ol className="rounded-3xl bg-paper p-7 ring-1 ring-line sm:p-8">
              {STEPS.map((step, index) => {
                const done = index < activeIndex;
                const current = index === activeIndex;
                return (
                  <li
                    key={step.key}
                    className="relative flex gap-4 pb-7 last:pb-0"
                  >
                    {index < STEPS.length - 1 && (
                      <span
                        aria-hidden="true"
                        className={`absolute left-[1.02rem] top-9 h-[calc(100%-2rem)] w-0.5 ${
                          done ? "bg-forest-600" : "bg-line"
                        }`}
                      />
                    )}
                    <span
                      className={`relative z-10 flex h-[2.05rem] w-[2.05rem] shrink-0 items-center justify-center rounded-full ${
                        done
                          ? "bg-forest-700 text-ivory-50"
                          : current
                            ? "bg-gold-500 text-forest-950 ring-4 ring-gold-500/20"
                            : "bg-ivory-100 text-ink-soft ring-1 ring-line"
                      }`}
                    >
                      {done ? (
                        <IconCheck className="h-4 w-4" />
                      ) : current ? (
                        <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-forest-950" />
                      ) : (
                        <span className="h-2 w-2 rounded-full bg-current opacity-50" />
                      )}
                    </span>
                    <div className="pt-0.5">
                      <p
                        className={`text-sm font-semibold ${
                          done || current ? "text-ink" : "text-ink-soft"
                        }`}
                      >
                        {step.label}
                        {current && (
                          <span className="ml-2 rounded-full bg-gold-200 px-2 py-0.5 text-[0.62rem] font-bold uppercase tracking-wide text-gold-700">
                            Current
                          </span>
                        )}
                      </p>
                      <p className="mt-1 text-xs leading-5 text-ink-soft">
                        {step.note}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>

            <p className="rounded-2xl bg-ivory-100 px-5 py-4 text-xs leading-5 text-ink-soft">
              <strong className="text-ink">Demo data.</strong> In the live
              system, the page refreshes automatically from real order status
              and (in a later phase) a courier map. The 45–50 minute window is
              an operational target, not a guarantee for every situation.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
