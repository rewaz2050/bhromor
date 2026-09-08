import Image from "next/image";
import Link from "next/link";
import { PRODUCTS } from "@/lib/catalog";
import { isDiscoverable } from "@/lib/merchandising";
import { Eyebrow } from "@/components/ui/primitives";
import { IconArrowRight } from "@/components/ui/icons";

/** Owned catalogue imagery, deliberately not presented as customer or Instagram photos. */
export default function BrandJournal() {
  const products = PRODUCTS.filter(
    (p) => isDiscoverable(p) && p.media.length > 0,
  ).slice(0, 6);
  if (!products.length) return null;
  return (
    <section
      aria-labelledby="journal-heading"
      className="border-t border-line bg-ivory-100/50"
    >
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <div className="mb-9 flex flex-wrap items-end justify-between gap-5">
          <div>
            <Eyebrow>The visual journal</Eyebrow>
            <h2
              id="journal-heading"
              className="mt-4 font-display text-4xl text-forest-900 sm:text-5xl"
            >
              The details make the everyday.
            </h2>
            <p className="mt-4 max-w-lg text-sm leading-7 text-ink-soft">
              Textures, tones and thoughtful little details. A closer look at
              our collection.
            </p>
          </div>
          <Link href="/about" className="editorial-text-link">
            Discover our story <IconArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-6">
          {products.map((product, i) => (
            <Link
              key={product.id}
              href={`/product/${product.slug}`}
              aria-label={`Explore ${product.name}`}
              className="group relative aspect-square overflow-hidden bg-ivory-200"
            >
              <Image
                src={(product.media[1] ?? product.media[0]).src}
                alt={(product.media[1] ?? product.media[0]).alt}
                fill
                sizes="(min-width: 1280px) 200px, (min-width: 1024px) 16vw, (min-width: 640px) 33vw, 50vw"
                className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
              />
              <span className="absolute bottom-2 left-2 bg-ivory-50/95 px-2 py-1 text-[10px] tracking-wider text-forest-900">
                0{i + 1} / {product.subCategory}
              </span>
            </Link>
          ))}
        </div>
        <p className="mt-4 text-xs text-ink-soft">
          From the PROSANTI collection · Tap a photograph to shop the piece.
        </p>
      </div>
    </section>
  );
}
