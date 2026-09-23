/**
 * Shopper push messages — **pure**, so one copy serves both sides:
 *   • the server (`src/lib/customer-push.ts`) builds the payload it sends;
 *   • the browser (`use-order-push.ts`) can name the event it is watching;
 *   • tests assert the Bangla copy without booting a database.
 *
 * Copy rules (same posture as the rest of the storefront):
 *   • Bangla first for a Sunamganj shopper (`lang: "bn"`), English second;
 *   • only public milestones — never internal states (`preparing`,
 *     `courier-assigned` are the shop's business, not the shopper's);
 *   • a cancelled order says so plainly and says there is nothing to pay;
 *   • the body always carries the order number so a shopper with two
 *     parcels can tell them apart on a lock screen.
 */

import { formatBdt } from "./format";
import { PUBLIC_STEPS } from "./orders";
import type { Language } from "./translations";

/** What a shopper is pushed about. Public milestones only. */
export type CustomerEventKind =
  | "placed"
  | "confirmed"
  | "picked-up"
  | "delivered"
  | "cancelled"
  | "payment-verified"
  /** Only from the opt-in card's own "Test pathan" button. */
  | "test";

export const CUSTOMER_EVENTS: readonly CustomerEventKind[] = [
  "placed",
  "confirmed",
  "picked-up",
  "delivered",
  "cancelled",
  "payment-verified",
];

/**
 * Which `OrderStatus` values are worth a push, and what they mean.
 *
 * Deliberately narrow: `pending`/`confirmed`/`preparing` collapse to
 * "confirmed", and `ready-for-pickup`/`courier-assigned` stay silent because
 * the shopper-visible milestone ("rider took it") is `out-for-delivery` —
 * `PUBLIC_STEPS[2].doneAt`. Three pushes per parcel, not eight.
 */
export const CUSTOMER_PUSH_STATUS: Partial<Record<string, CustomerEventKind>> = {
  // `confirmed` only: `preparing` is an internal step the two-tap flow often
  // skips entirely, and firing the same "confirmed" event twice would make the
  // notification look broken.
  confirmed: "confirmed",
  "out-for-delivery": "picked-up",
  delivered: "delivered",
  cancelled: "cancelled",
};

export interface CustomerMessage {
  title: string;
  body: string;
  href: string;
}

export interface MessageInput {
  kind: CustomerEventKind;
  orderNo: string;
  /**
   * The checkout phone. It goes in the link (never in the visible body):
   * `/track` proves ownership with order number + phone, so the tap lands on
   * this order's tracker with nothing to type.
   */
  phone?: string | null;
  /** Integer paisa (§69). Optional — the confirmation screen is the total's home. */
  total?: number | null;
  lang?: Language;
}

interface EventCopy {
  title: string;
  body: string;
}

const BN: Record<CustomerEventKind, EventCopy> = {
  placed: {
    title: "অর্ডার পেয়েছি ✅",
    body: "আপনার অর্ডার {no} আমরা পেয়েছি। দোকান কনফার্ম করলেই খবর পাবেন।",
  },
  confirmed: {
    title: "অর্ডার কনফার্ম হয়েছে",
    body: "{no} কনফার্ম — দোকান এখন প্যাক করছে। রাইডার বের হলে আবার জানাব।",
  },
  "picked-up": {
    title: "রাইডার আপনার পার্সেল নিয়েছে 🛵",
    body: "{no} রাইডারের হাতে — আপনার দিকে আসছে। ডেলিভারির সময় ৪ ডিজিটের কোডটি রেডি রাখুন।",
  },
  delivered: {
    title: "ডেলিভারি হয়েছে 🎉",
    body: "{no} পৌঁছে গেছে। কেনাকাটার জন্য ধন্যবাদ — কেমন লাগলো জানান।",
  },
  cancelled: {
    title: "অর্ডার বাতিল হয়েছে",
    body: "{no} বাতিল করা হয়েছে। কিছু দিতে হবে না। ভুল হলে আমাদের কল বা WhatsApp করুন।",
  },
  "payment-verified": {
    title: "পেমেন্ট ভেরিফাই হয়েছে ✅",
    body: "{no} — আপনার bKash/Nagad পেমেন্ট দোকান যাচাই করে নিয়েছে। অর্ডার এগোচ্ছে।",
  },
  test: {
    title: "PROSANTI test 🔔",
    body: "{no} — ফোনে খবর চালু আছে। এখন থেকে অর্ডারের প্রতিটি ধাপ এখানে আসবে।",
  },
};

const EN: Record<CustomerEventKind, EventCopy> = {
  placed: {
    title: "Order received ✅",
    body: "We have your order {no}. You will hear from us the moment the shop confirms it.",
  },
  confirmed: {
    title: "Order confirmed",
    body: "{no} is confirmed — the shop is packing it now. We will tell you when the rider leaves.",
  },
  "picked-up": {
    title: "The rider has your parcel 🛵",
    body: "{no} is with the rider and on the way. Keep the 4-digit code ready for handover.",
  },
  delivered: {
    title: "Delivered 🎉",
    body: "{no} reached you. Thank you for shopping with PROSANTI — tell us how it went.",
  },
  cancelled: {
    title: "Order cancelled",
    body: "{no} was cancelled. Nothing to pay. If that was a mistake, call or WhatsApp us.",
  },
  "payment-verified": {
    title: "Payment verified ✅",
    body: "{no} — the shop checked your bKash/Nagad payment. Your order is moving.",
  },
  test: {
    title: "PROSANTI test 🔔",
    body: "{no} — phone updates are ON. Every step of your order will land here.",
  },
};

const COPY: Record<Language, Record<CustomerEventKind, EventCopy>> = { bn: BN, en: EN };

/** Human label for an event — used by the opt-in card and tests. */
export const customerEventLabel = (
  kind: CustomerEventKind,
  lang: Language = "bn",
): string => COPY[lang][kind].title;

/**
 * Build the push payload for one milestone.
 *
 * `href` carries the order id AND the phone exactly as `/api/track` expects,
 * so tapping the notification lands on *this* order's tracker with no typing
 * — while still being a normal track link (a shared phone can open it).
 */
export const customerPushMessage = (input: MessageInput): CustomerMessage => {
  const lang: Language = input.lang === "en" ? "en" : "bn";
  const copy = COPY[lang][input.kind];
  const orderNo = input.orderNo.trim().toUpperCase();
  const body = copy.body.replace("{no}", orderNo);
  const total =
    typeof input.total === "number" && input.total > 0
      ? lang === "bn"
        ? ` · মোট ${formatBdt(input.total)}`
        : ` · Total ${formatBdt(input.total)}`
      : "";
  return {
    title: copy.title,
    body: `${body}${total}`,
    href: `/track?id=${encodeURIComponent(orderNo)}&phone=${encodeURIComponent(
      (input.phone ?? "").trim(),
    )}`,
  };
};

/** Map an internal status to the shopper-facing event (null = stay silent). */
export const statusToEventKind = (status: string): CustomerEventKind | null =>
  CUSTOMER_PUSH_STATUS[status] ?? null;

/**
 * The four milestone titles an opted-in shopper will receive — the opt-in
 * card lists exactly these, so the promise shown and the promise kept cannot
 * drift apart.
 */
export const publicStepEvent = (
  stepKey: (typeof PUBLIC_STEPS)[number]["key"],
): CustomerEventKind => {
  switch (stepKey) {
    case "placed":
      return "placed";
    case "confirmed":
      return "confirmed";
    case "picked-up":
      return "picked-up";
    default:
      return "delivered";
  }
};

export const customerPushPromise = (
  lang: Language = "bn",
): { kind: CustomerEventKind; title: string }[] =>
  PUBLIC_STEPS.map((step) => {
    const kind = publicStepEvent(step.key);
    return { kind, title: COPY[lang][kind].title };
  });
