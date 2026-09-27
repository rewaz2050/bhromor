"use client";

import { swatchBackground } from "@/lib/color-swatch";

/**
 * Colour dots on the product card (UX plan §1.1, R9): up to `max`
 * swatches plus "+N", each named for screen readers. Colours we cannot
 * render honestly fall back to their name in text, so the row never lies.
 */
export default function ColorSwatches({
  colors,
  max = 3,
  className = "",
}: {
  colors: string[];
  max?: number;
  className?: string;
}) {
  const names = colors.map((c) => c.trim()).filter(Boolean);
  if (names.length === 0) return null;
  const shown = names.slice(0, max);
  const rest = names.length - shown.length;
  const resolved = shown.map((name) => ({ name, bg: swatchBackground(name) }));
  if (resolved.every((r) => r.bg === null)) {
    return (
      <span className={`font-medium normal-case tracking-[0.06em] text-ink-soft/80 ${className}`}>
        {names[0]}
        {names.length > 1 ? ` +${names.length - 1}` : ""}
      </span>
    );
  }
  return (
    <span
      data-testid="card-swatches"
      className={`inline-flex items-center gap-1 ${className}`}
      aria-label={names.join(", ")}
      title={names.join(" · ")}
    >
      {resolved.map(({ name, bg }) =>
        bg ? (
          <span
            key={name}
            data-swatch={name}
            aria-hidden="true"
            className="block h-3 w-3 rounded-full ring-1 ring-forest-950/15"
            style={{ background: bg }}
          />
        ) : (
          <span key={name} data-swatch={name} aria-hidden="true" className="text-[0.58rem] font-medium normal-case tracking-normal text-ink-soft/80">
            {name}
          </span>
        ),
      )}
      {rest > 0 && (
        <span aria-hidden="true" className="text-[0.58rem] font-semibold tracking-normal text-ink-soft">
          +{rest}
        </span>
      )}
    </span>
  );
}
