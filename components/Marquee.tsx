import { marqueeWords } from '@/lib/content';

/** Infinite horizontal ticker of brand words. Pure CSS animation. */
export default function Marquee({ invert = false }: { invert?: boolean }) {
  const items = [...marqueeWords, ...marqueeWords];

  return (
    <div
      aria-hidden
      className={`relative flex overflow-hidden border-y py-6 ${
        invert
          ? 'border-ivory/15 bg-moss-900 text-ivory-deep'
          : 'border-ink/10 bg-ivory text-ink'
      }`}
    >
      <div className="flex w-max animate-marquee items-center gap-12 whitespace-nowrap pr-12">
        {items.map((word, i) => (
          <span key={`${word}-${i}`} className="flex items-center gap-12">
            <span
              className={`font-display text-[clamp(1.25rem,2.4vw,2rem)] font-light tracking-tight ${
                word.match(/[\u0980-\u09FF]/) ? 'font-bengali' : 'italic'
              }`}
            >
              {word}
            </span>
            <span
              className={`h-1 w-1 rounded-full ${
                invert ? 'bg-brass-300/70' : 'bg-moss-500/50'
              }`}
            />
          </span>
        ))}
      </div>
    </div>
  );
}
