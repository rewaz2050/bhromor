"use client";

/**
 * The handover photo (post-purchase pass, 2026-10-06).
 *
 * Cash on delivery is a trust purchase: the shopper pays someone they have
 * never met, at a door, often to a family member. The rider already uploads
 * a proof photo (Cloudinary, `deliveryProofUrl`) — it lived in the database
 * and nowhere else. Showing it closes the loop: the parcel did arrive, here
 * is where it was left, and if something is wrong the exchange window is
 * right below it.
 *
 * Renders nothing when there is no photo: no placeholder, no "coming soon".
 */

import Image from "next/image";
import { useLanguage } from "@/components/i18n/language-provider";
import { IconCheck } from "@/components/ui/icons";
import { clockTime } from "@/components/admin/order-ui";
import type { Order } from "@/lib/orders";

export default function DeliveryProof({ order }: { order: Order }) {
  const { t } = useLanguage();
  if (order.status !== "delivered" || !order.deliveryProofUrl) return null;

  const at =
    order.deliveryProofUploadedAt ??
    order.timeline.find((entry) => entry.status === "delivered")?.at;

  return (
    <section
      aria-label={t("track.proofTitle")}
      className="overflow-hidden rounded-3xl bg-paper ring-1 ring-line"
    >
      <div className="flex items-center gap-2 px-5 pt-5 sm:px-6">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 text-emerald-800">
          <IconCheck className="h-4 w-4" />
        </span>
        <h3 className="font-display text-lg font-medium text-forest-900">
          {t("track.proofTitle")}
        </h3>
        {at && (
          <span className="ml-auto text-xs text-ink-soft">{clockTime(at)}</span>
        )}
      </div>
      <div className="mt-4 overflow-hidden px-5 sm:px-6">
        <Image
          src={order.deliveryProofUrl}
          alt=""
          width={800}
          height={600}
          sizes="(max-width: 640px) 92vw, 560px"
          className="h-auto w-full rounded-2xl object-cover ring-1 ring-line"
        />
      </div>
      <p className="px-5 pb-5 pt-4 text-xs leading-6 text-ink-soft sm:px-6">
        {t("track.proofNote")}
      </p>
    </section>
  );
}
