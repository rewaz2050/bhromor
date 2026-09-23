/**
 * Proactive WhatsApp status updates — admin/vendor 1-tap messages.
 *
 * BD customers live on WhatsApp; an order that talks ("confirmed", "rider is
 * on the way", "delivered — thank you") cancels less and reviews more. Every
 * message is prefilled (wa.me deep link, no API, no token) and honest: only
 * facts the order actually carries — id, total, payment state, rider name,
 * PIN, ETA and the customer's own track link.
 *
 * The link only exists when the phone is a plausible BD mobile — a chat
 * button to nowhere is worse than none (same rule as the storefront).
 */

import type { Order } from "./orders";
import { waE164 } from "./whatsapp-order";
import { formatBdt } from "./format";
import { absoluteUrl } from "./site-url";
import { SUNAMGANJ_HUB } from "./sunamganj";

export type WaStatusKind =
  | "confirmed"
  | "readyPickup"
  | "onTheWay"
  | "courier"
  | "delivered";

export const WA_STATUS_LABELS: Record<WaStatusKind, string> = {
  confirmed: "Confirmed",
  readyPickup: "Ready — pickup",
  onTheWay: "On the way",
  courier: "Courier dispatch",
  delivered: "Delivered — thank you",
};

const paymentLabel = (order: Order): string =>
  order.payment === "bkash" ? "bKash" : order.payment === "nagad" ? "Nagad" : "COD";

const trackLink = (order: Order): string =>
  absoluteUrl(
    `/track?id=${encodeURIComponent(order.id)}&phone=${encodeURIComponent(order.customer.phone)}`,
  );

const pinOf = (order: Order): string => order.deliveryCode ?? "";

/** Which status updates make sense for this order right now. */
export const applicableWaStatuses = (order: Order): WaStatusKind[] => {
  const kinds: WaStatusKind[] = [];
  if (["pending", "confirmed", "preparing"].includes(order.status)) {
    kinds.push("confirmed");
  }
  if (order.status === "ready-for-pickup" && order.isPickup) {
    kinds.push("readyPickup");
  }
  if (
    order.status === "courier-assigned" ||
    order.status === "out-for-delivery"
  ) {
    kinds.push(order.zoneId === "z4" && !order.isPickup ? "courier" : "onTheWay");
  }
  if (order.status === "delivered") kinds.push("delivered");
  return kinds;
};

/** The prefilled Bangla message for a status — plain text, facts only. */
export const statusWaMessage = (order: Order, kind: WaStatusKind): string => {
  const name = order.customer.name.trim();
  const total = formatBdt(order.total);
  const track = trackLink(order);
  const pin = pinOf(order);
  const pay = paymentLabel(order);
  const prepaid = order.payment !== "cod";
  const pinLine = pin ? ` দরজায় ৪-ডিজিট PIN ${pin} দেখান।` : "";
  const payLine = prepaid
    ? `পেমেন্ট (${pay}) নেওয়া হয়েছে।`
    : `দরজায় ${total} (${pay}) পরিশোধ করবেন।`;

  switch (kind) {
    case "confirmed":
      return [
        `${name}, আপনার PROSANTI অর্ডার ${order.id} কনফার্ম হয়েছে।`,
        `আনুমানিক পৌঁছানো: ${order.etaLabel || "৪৫–৫০ মিনিট"}।`,
        payLine,
        `ট্র্যাক করুন: ${track}`,
      ].join(" ");
    case "readyPickup":
      return [
        `${name}, আপনার অর্ডার ${order.id} প্রস্তুত — ${SUNAMGANJ_HUB} থেকে সংগ্রহ করুন।`,
        `মোট ${total} (${pay})।${pin ? ` সংগ্রহের সময় PIN ${pin} বলুন।` : ""}`,
      ].join(" ");
    case "onTheWay": {
      const rider = order.rider?.name?.trim();
      return [
        `${name}, আপনার অর্ডার ${order.id} রাইডার${rider ? ` ${rider}` : ""} নিয়ে রওনা দিয়েছে।`,
        `আনুমানিক পৌঁছানো: ${order.etaLabel || "শীঘ্রই"}।`,
        payLine + pinLine,
        `ট্র্যাক করুন: ${track}`,
      ].join(" ");
    }
    case "courier":
      return [
        `${name}, আপনার অর্ডার ${order.id} কুরিয়ারে পাঠানো হয়েছে।`,
        `আনুমানিক পৌঁছানো: ${order.etaLabel || "২–৩ দিন"}।`,
        prepaid ? "পেমেন্ট নেওয়া হয়েছে।" : "কুরিয়ার ডেলিভারির সময় টাকা পরিশোধ করবেন।",
        `ট্র্যাক করুন: ${track}`,
      ].join(" ");
    case "delivered":
      return [
        `${name}, আপনার অর্ডার ${order.id} ডেলিভারি সম্পন্ন — ধন্যবাদ!`,
        "পছন্দ হলে এক লাইনের রিভিউ দিন, পরের ক্রেতার ভরসা হবে:",
        track,
      ].join(" ");
  }
};

/** wa.me deep link for a status — null when the phone is not a real BD mobile. */
export const waStatusLink = (
  order: Order,
  kind: WaStatusKind,
): string | null => {
  const e164 = waE164(order.customer.phone);
  if (!e164) return null;
  return `https://wa.me/${e164}?text=${encodeURIComponent(
    statusWaMessage(order, kind),
  )}`;
};

/** The generic "here is your order" chat (the old one-tap button). */
export const waOrderLink = (order: Order): string | null => {
  const e164 = waE164(order.customer.phone);
  if (!e164) return null;
  const text = `PROSANTI অর্ডার ${order.id} — ${order.customer.name}, ${order.customer.area}। মোট ${formatBdt(
    order.total,
  )} (${payLabelBn(order)})। ট্র্যাক: ${trackLink(order)}`;
  return `https://wa.me/${e164}?text=${encodeURIComponent(text)}`;
};

const payLabelBn = (order: Order): string =>
  order.payment === "bkash" ? "বিকাশ" : order.payment === "nagad" ? "নগদ" : "ক্যাশ";
