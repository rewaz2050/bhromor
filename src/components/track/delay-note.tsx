"use client";

/**
 * The honest late note (post-purchase pass, 2026-10-06).
 *
 * Every delivery promise eventually slips — rain, traffic, a shop that took
 * too long to pack. What turns a slip into a complaint is silence: the
 * shopper watches the promised window pass with a page that still says
 * "45–50 min". This names the delay, in minutes, and gives the two things
 * that actually help — the rider's number, or the shop's WhatsApp.
 *
 * It never invents a cause. It has no idea why the rider is late, and a
 * confident wrong reason ("heavy traffic") is worse than no reason.
 */

import { useLanguage } from "@/components/i18n/language-provider";
import { IconPhone, IconChat } from "@/components/ui/icons";
import { useNow } from "@/lib/use-now";
import { trackEta } from "@/lib/track-eta";
import { bnDigits } from "@/lib/arrival";
import type { Order } from "@/lib/orders";

export default function DelayNote({
  order,
  contactNumber,
}: {
  order: Order;
  /** The shop's WhatsApp number from /api/contact (absent = no button). */
  contactNumber?: string | null;
}) {
  const { t, lang } = useLanguage();
  // One subscribed clock, never a Date.now() read inside render.
  const now = useNow(60_000);
  const eta = trackEta(order, now);
  if (!eta.late) return null;

  const minutes =
    lang === "bn" ? bnDigits(String(eta.lateMinutes)) : String(eta.lateMinutes);

  return (
    <section
      role="status"
      aria-label={t("track.delayTitle").replace("{minutes}", minutes)}
      className="rounded-3xl bg-amber-50 p-5 ring-1 ring-amber-200 sm:p-6"
    >
      <p className="font-display text-lg font-medium text-amber-900">
        {t("track.delayTitle").replace("{minutes}", minutes)}
      </p>
      <p className="mt-1.5 max-w-xl text-sm leading-6 text-amber-900/80">
        {t("track.delayBody")}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {order.rider?.phone && (
          <a
            href={`tel:${order.rider.phone.replace(/[^\d+]/g, "")}`}
            aria-label={`${t("track.riderCall")} — ${order.rider.name}`}
            className="inline-flex h-11 items-center gap-2 rounded-full bg-amber-900 px-4 text-xs font-semibold text-ivory-50 transition-colors hover:bg-amber-800"
          >
            <IconPhone className="h-4 w-4" />
            {t("track.riderCall")} · {order.rider.name}
          </a>
        )}
        {contactNumber && (
          <a
            href={`https://wa.me/88${contactNumber.replace(/\D/g, "")}?text=${encodeURIComponent(
              `Order ${order.id} — it is past the promised time. Where is it now?`,
            )}`}
            target="_blank"
            rel="noreferrer"
            aria-label="WhatsApp the shop about this order"
            className="inline-flex h-11 items-center gap-2 rounded-full border border-amber-300 bg-paper px-4 text-xs font-semibold text-amber-900 transition-colors hover:bg-amber-100"
          >
            <IconChat className="h-4 w-4" />
            WhatsApp
          </a>
        )}
      </div>
    </section>
  );
}
