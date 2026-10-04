"use client";

/** Admin → Order: the photo(s) a rider attached to a failed delivery attempt (202610020020). Quiet when there are none. */
import Image from "next/image";
import { useEffect, useState } from "react";
import { apiGet } from "@/lib/admin-api";
import type { OrderFailedProofs } from "@/lib/db/failed-proof";

const when = (iso: string): string =>
  new Date(iso).toLocaleString("en-GB", { timeZone: "Asia/Dhaka", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

export default function FailedProofPanel({ orderId }: { orderId: string }) {
  const [data, setData] = useState<OrderFailedProofs | null>(null);

  useEffect(() => {
    let alive = true;
    apiGet<OrderFailedProofs>(`/api/admin/orders/${encodeURIComponent(orderId)}/failed-proof`)
      .then((d) => {
        if (alive && d && Array.isArray(d.proofs)) setData(d);
      })
      .catch(() => undefined); // an extra panel must never get in the way of the order page
    return () => {
      alive = false;
    };
  }, [orderId]);

  if (!data || !data.ready || data.proofs.length === 0) return null;
  return (
    <div data-testid="failed-proofs" className="mt-2 space-y-2 rounded-xl bg-rose-50 p-3 ring-1 ring-rose-200">
      <p className="text-[0.7rem] font-bold uppercase tracking-wider text-rose-900">Failed-attempt photo</p>
      {data.proofs.map((p) => (
        <div key={p.id} className="space-y-1">
          {p.photoUrl ? (
            <a href={p.photoUrl} target="_blank" rel="noreferrer" className="relative block h-48 w-full overflow-hidden rounded-lg">
              <Image src={p.photoUrl} alt="Failed delivery attempt photo" fill sizes="(min-width: 1024px) 40vw, 100vw" className="object-cover" />
            </a>
          ) : (
            <p className="text-xs text-rose-950">No photo — rider says: {p.noPhotoNote}</p>
          )}
          <p className="text-[10px] text-ink-soft">{when(p.at)}</p>
        </div>
      ))}
    </div>
  );
}
