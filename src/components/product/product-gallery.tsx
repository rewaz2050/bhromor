"use client";

import Image from "next/image";
import { useState } from "react";
import type { Product } from "@/lib/catalog";

export default function ProductGallery({ product }: { product: Product }) {
  const [active, setActive] = useState(0);
  // Clamp: navigating between products (or an admin removing an image) could
  // leave the index pointing past the end, blanking the gallery.
  const index = Math.min(Math.max(active, 0), Math.max(product.media.length - 1, 0));
  const current = product.media[index];

  return (
    <div>
      <div className="arch relative aspect-[4/5] overflow-hidden bg-ivory-100 ring-1 ring-line">
        {current ? (
          <Image
            src={current.src}
            alt={current.alt}
            fill
            priority
            sizes="(min-width: 1024px) 48vw, 100vw"
            className="object-cover"
          />
        ) : null}
        {product.badge && (
          <span className="absolute left-4 top-4 rounded-full bg-forest-800 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-ivory-50">
            {product.badge === "new"
              ? "New"
              : product.badge === "sale"
                ? "Sale"
                : "Featured"}
          </span>
        )}
      </div>

      {product.media.length > 1 && (
        <div className="mt-4 flex gap-3">
          {product.media.map((media, i) => (
            <button
              key={`${media.src}-${i}`}
              type="button"
              onClick={() => setActive(i)}
              aria-label={`View image ${i + 1}: ${media.alt}`}
              aria-pressed={index === i}
              className={`relative aspect-square w-20 overflow-hidden rounded-xl ring-2 transition-all ${
                index === i
                  ? "ring-forest-700"
                  : "ring-transparent opacity-70 hover:opacity-100"
              }`}
            >
              <Image
                src={media.src}
                alt=""
                fill
                sizes="80px"
                className="object-cover"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
