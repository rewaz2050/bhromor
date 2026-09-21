"use client";

import { IconChat } from "@/components/ui/icons";
import {
  WA_STATUS_LABELS,
  applicableWaStatuses,
  waOrderLink,
  waStatusLink,
} from "@/lib/admin-wa";
import type { Order } from "@/lib/orders";

/**
 * One-tap WhatsApp updates on the admin order page: a chip per status this
 * order can currently announce (confirmed / on the way / delivered…), each
 * opening WhatsApp with the Bangla message already written. Falls back to
 * the plain order chat when the number is not a plausible BD mobile — the
 * buttons simply do not render rather than dead-click.
 */

export default function OrderWhatsAppStatus({ order }: { order: Order }) {
  const kinds = applicableWaStatuses(order);
  const generic = waOrderLink(order);
  if (kinds.length === 0 && !generic) return null;

  const open = (link: string | null) => {
    if (link) window.open(link, "_blank", "noopener");
  };

  return (
    <div
      data-testid="order-wa-status"
      className="flex flex-wrap items-center gap-2"
    >
      {kinds.map((kind) => (
        <button
          key={kind}
          type="button"
          data-testid={`order-wa-${kind}`}
          onClick={() => open(waStatusLink(order, kind))}
          disabled={waStatusLink(order, kind) === null}
          className="inline-flex items-center gap-1.5 rounded-full bg-[#25D366]/12 px-3.5 py-2 text-xs font-semibold text-[#128C4A] ring-1 ring-[#25D366]/40 hover:bg-[#25D366]/20 disabled:opacity-40"
        >
          <IconChat className="h-3.5 w-3.5" />
          WhatsApp · {WA_STATUS_LABELS[kind]}
        </button>
      ))}
      {generic && (
        <button
          type="button"
          data-testid="order-wa-generic"
          onClick={() => open(generic)}
          className="rounded-full bg-[#25D366] px-4 py-2 text-xs font-semibold text-white hover:brightness-95"
        >
          WhatsApp customer
        </button>
      )}
    </div>
  );
}
