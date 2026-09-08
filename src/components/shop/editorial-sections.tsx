import Image from "next/image";
import Link from "next/link";
import { PRODUCTS } from "@/lib/catalog";
import { MOODS, under500 } from "@/lib/merchandising";
import { Eyebrow } from "@/components/ui/primitives";
import ProductCard from "@/components/product/product-card";
import { IconArrowRight } from "@/components/ui/icons";

export function ShopByMood() {
  return (
    <section
      aria-labelledby="mood-heading"
      className="border-y border-line bg-ivory-100/60"
    >
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <div className="mb-10 flex flex-wrap items-end justify-between gap-5">
          <div>
            <Eyebrow>Find your style</Eyebrow>
            <h2
              id="mood-heading"
              className="mt-4 font-display text-4xl text-forest-900 sm:text-5xl"
            >
              Dress for your kind of day.
            </h2>
          </div>
          <p className="max-w-xs text-sm leading-7 text-ink-soft">
            From slow mornings to meaningful celebrations. A considered edit for
            every mood.
          </p>
        </div>
        <div className="grid gap-5 md:grid-cols-3">
          {MOODS.map((mood, i) => (
            <Link
              key={mood.id}
              href={`/shop?mood=${mood.id}`}
              aria-label={`Explore ${mood.name}`}
              className="group relative block aspect-[4/5] overflow-hidden bg-ivory-200"
            >
              <Image
                src={mood.image}
                alt={mood.alt}
                fill
                sizes="(min-width: 1280px) 390px, (min-width: 768px) 33vw, 100vw"
                className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
              />
              <div
                aria-hidden="true"
                className="absolute inset-0 bg-gradient-to-t from-forest-950/90 via-forest-950/10 to-transparent"
              />
              <span className="absolute left-6 top-6 bg-ivory-50/90 px-3 py-2 text-[10px] tracking-[0.18em] text-forest-900">
                0{i + 1} / THE STYLE EDIT
              </span>
              <div className="absolute inset-x-6 bottom-7 text-white">
                <h3 className="font-display text-4xl">{mood.name}</h3>
                <p className="mt-3 text-sm text-ivory-100/85">
                  {mood.description}
                </p>
                <span className="mt-6 inline-flex min-h-11 items-center gap-5 border-b border-gold-300 text-xs uppercase tracking-widest">
                  Explore{" "}
                  <IconArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

export function BudgetEdit() {
  const products = under500(PRODUCTS).slice(0, 4);
  if (!products.length) return null;
  return (
    <section
      aria-labelledby="budget-heading"
      className="mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:px-6 md:grid-cols-[1fr_2fr] lg:px-8 lg:py-24"
    >
      <div className="flex flex-col justify-center">
        <Eyebrow>Small joys. Thoughtful prices.</Eyebrow>
        <h2
          id="budget-heading"
          className="mt-4 font-display text-4xl text-forest-900 sm:text-5xl"
        >
          Under ৳500
        </h2>
        <p className="mt-3 font-bengali text-sm text-gold-600">
          সাধ্যের মধ্যে, প্রতিদিনের জন্য
        </p>
        <p className="mt-5 max-w-sm text-sm leading-7 text-ink-soft">
          Everyday essentials that feel good, without the extra spend. All
          pieces in this edit are priced below ৳500.
        </p>
        <Link
          href="/shop?price=under500"
          className="editorial-text-link mt-6 self-start"
        >
          Shop the budget edit <IconArrowRight className="h-4 w-4" />
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-x-5 gap-y-10">
        {products.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </section>
  );
}
