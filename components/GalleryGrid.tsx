import Image from 'next/image';
import Reveal from './Reveal';
import { gallery } from '@/lib/content';

/**
 * Editorial photo grid of the grounds.
 *
 * The five tiles fill a 12-column grid: the mist tile is tall and spans two
 * rows, giving a 7+5 / 7+5 / 4+8 arrangement. Placement classes come from
 * lib/content.ts. Falls back to a single column below `lg`, where every tile
 * is a plain 4:3 image.
 */
export default function GalleryGrid() {
  return (
    <section className="bg-moss-950 text-ivory-deep">
      <div className="mx-auto max-w-8xl px-6 py-28 sm:px-10 sm:py-36">
        <Reveal>
          <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
            <div>
              <p className="eyebrow !text-brass-300 [&::before]:!bg-brass-400">
                The grounds
              </p>
              <h2 className="display-lg mt-8 max-w-2xl font-light text-ivory-pale">
                Forty-two acres, and nowhere you have to be.
              </h2>
            </div>
            <p className="max-w-xs font-sans text-sm font-light leading-relaxed text-ivory-deep/60">
              Photographed across a year on the property. The nearest streetlight
              is four kilometres away, which is why the last one looks like
              that.
            </p>
          </div>
        </Reveal>

        <div className="mt-20 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:auto-rows-[280px] lg:grid-cols-12">
          {gallery.map((item, i) => (
            <Reveal
              key={item.src}
              delay={(i % 3) * 100}
              className={`${item.grid} aspect-[4/3] lg:aspect-auto lg:h-full`}
            >
              <figure className="group relative h-full overflow-hidden rounded-sm">
                <Image
                  src={item.src}
                  alt={item.alt}
                  fill
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 45vw"
                  className="object-cover transition-transform duration-[1.6s] ease-calm group-hover:scale-[1.06]"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-moss-950/85 via-transparent to-transparent opacity-0 transition-opacity duration-700 ease-calm group-hover:opacity-100" />
                <figcaption className="absolute inset-x-0 bottom-0 translate-y-3 p-6 font-sans text-sm font-light text-ivory-pale opacity-0 transition-all duration-700 ease-calm group-hover:translate-y-0 group-hover:opacity-100">
                  {item.caption}
                </figcaption>
              </figure>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
