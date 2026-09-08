"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { useReviews } from "@/lib/use-reviews";
import { useCatalog } from "@/lib/use-catalog";
import {
  STATUS_LABEL,
  statusCounts,
  type ReviewStatus,
} from "@/lib/review-store";
import { IconCheck, IconFlag, IconStar, IconTrash } from "@/components/ui/icons";

const FILTERS: (ReviewStatus | "all")[] = ["all", "pending", "flagged", "approved", "hidden"];

const BADGE: Record<ReviewStatus, string> = {
  pending: "bg-amber-100 text-amber-900",
  approved: "bg-emerald-100 text-emerald-800",
  hidden: "bg-ivory-200 text-ink-soft",
  flagged: "bg-rose-100 text-rose-800",
};

/** §30 admin moderation queue — approve / hide / flag / feature / delete. */
export default function AdminReviewsPage() {
  const { reviews, moderate, feature, remove, reset } = useReviews();
  const { products } = useCatalog();
  const [filter, setFilter] = useState<ReviewStatus | "all">("all");
  const [productId, setProductId] = useState<string>("all");

  const counts = useMemo(() => statusCounts(reviews), [reviews]);

  const visible = useMemo(
    () =>
      [...reviews]
        .filter((r) => (filter === "all" ? true : r.status === filter))
        .filter((r) => (productId === "all" ? true : r.productId === productId))
        .sort((a, b) => b.date - a.date),
    [reviews, filter, productId],
  );

  const productOf = (id: string) => products.find((p) => p.id === id);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-lg font-medium text-forest-900">
          Reviews
        </h2>
        <button
          type="button"
          onClick={() => {
            if (window.confirm("Reset reviews to the seeded sample data?")) reset();
          }}
          className="rounded-full px-4 py-2 text-xs font-semibold text-ink-soft ring-1 ring-line transition-colors hover:bg-paper hover:text-forest-800"
        >
          Reset demo reviews
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by status">
          {FILTERS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setFilter(s)}
              aria-pressed={filter === s}
              className={`inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[0.8rem] font-medium transition-colors ${
                filter === s
                  ? "bg-forest-800 text-ivory-50"
                  : "bg-paper text-ink-soft ring-1 ring-line hover:text-forest-800"
              }`}
            >
              {s === "all" ? "All" : STATUS_LABEL[s]}
              <span className={`rounded-full px-1.5 text-[0.65rem] font-bold ${filter === s ? "bg-white/20 text-ivory-50" : "bg-ivory-100 text-ink-soft"}`}>
                {s === "all" ? reviews.length : counts[s]}
              </span>
            </button>
          ))}
        </div>
        <select
          value={productId}
          onChange={(e) => setProductId(e.target.value)}
          aria-label="Filter by product"
          className="ml-auto rounded-full border-0 bg-paper px-4 py-2 text-sm text-ink ring-1 ring-line focus:outline-none focus:ring-2 focus:ring-forest-600"
        >
          <option value="all">All products</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {visible.length === 0 ? (
        <div className="rounded-2xl bg-paper py-16 text-center ring-1 ring-line">
          <p className="font-display text-lg text-forest-900">Queue is clear</p>
          <p className="mt-1 text-sm text-ink-soft">
            Nothing matches this filter right now.
          </p>
        </div>
      ) : (
        <ul className="space-y-4">
          {visible.map((r) => {
            const product = productOf(r.productId);
            return (
              <li key={r.id} className="rounded-2xl bg-paper p-5 ring-1 ring-line">
                <div className="flex flex-wrap items-start gap-4">
                  <Image
                    src={product?.media[0]?.src ?? ""}
                    alt=""
                    width={52}
                    height={52}
                    className="h-[52px] w-[52px] shrink-0 rounded-xl object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <p className="text-sm font-semibold text-ink">{r.author}</p>
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.62rem] font-bold uppercase tracking-wide ${BADGE[r.status]}`}>
                        {r.status === "flagged" && <IconFlag className="h-3 w-3" />}
                        {STATUS_LABEL[r.status]}
                      </span>
                      {r.featured && (
                        <span className="rounded-full bg-gold-100 px-2 py-0.5 text-[0.62rem] font-bold uppercase tracking-wide text-gold-700">
                          Featured
                        </span>
                      )}
                      {r.verified && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[0.62rem] font-bold uppercase tracking-wide text-emerald-800">
                          <IconCheck className="h-3 w-3" /> Verified
                        </span>
                      )}
                      <span className="ml-auto text-xs text-ink-soft">
                        {new Date(r.date).toLocaleDateString("en-GB", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-ink-soft">
                      {product?.name ?? r.productId} · {product?.sku ?? ""}
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      <span className="inline-flex items-center gap-0.5" aria-label={`${r.rating} stars`}>
                        {[1, 2, 3, 4, 5].map((i) => (
                          <IconStar key={i} className={`h-3.5 w-3.5 ${i <= r.rating ? "text-gold-500" : "text-ivory-200"}`} />
                        ))}
                      </span>
                      {r.title && <p className="text-sm font-semibold text-ink">{r.title}</p>}
                    </div>
                    <p className="mt-1.5 text-sm leading-6 text-ink-soft">{r.body}</p>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
                  {r.status !== "approved" && (
                    <button
                      type="button"
                      onClick={() => moderate(r.id, "approved")}
                      className="inline-flex items-center gap-1.5 rounded-full bg-emerald-700 px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-600"
                    >
                      <IconCheck className="h-3.5 w-3.5" /> Approve
                    </button>
                  )}
                  {r.status !== "hidden" && (
                    <button
                      type="button"
                      onClick={() => moderate(r.id, "hidden")}
                      className="rounded-full px-4 py-1.5 text-xs font-semibold text-ink-soft ring-1 ring-line transition-colors hover:text-ink"
                    >
                      Hide
                    </button>
                  )}
                  {r.status !== "flagged" && (
                    <button
                      type="button"
                      onClick={() => moderate(r.id, "flagged")}
                      className="inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold text-rose-700 ring-1 ring-rose-300 transition-colors hover:bg-rose-50"
                    >
                      <IconFlag className="h-3.5 w-3.5" /> Flag
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => feature(r.id)}
                    className="rounded-full px-4 py-1.5 text-xs font-semibold text-gold-700 ring-1 ring-gold-300 transition-colors hover:bg-gold-100"
                  >
                    {r.featured ? "Unfeature" : "Feature"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm("Delete this review permanently?")) remove(r.id);
                    }}
                    className="ml-auto inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold text-rose-700 ring-1 ring-rose-300 transition-colors hover:bg-rose-50"
                  >
                    <IconTrash className="h-3.5 w-3.5" /> Delete
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
