import Link from "next/link";
import { formatBdt } from "@/lib/format";
import { IconStar } from "./icons";

/** Shared style recipes (kept small & consistent). */

export const btn = {
  base: "tap-press inline-flex items-center justify-center gap-2 rounded-full font-medium transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-50 active:scale-[0.98]",
  primary:
    "bg-forest-800 text-ivory-50 hover:bg-forest-700 active:bg-forest-900 shadow-sm",
  dark: "bg-ink text-ivory-50 hover:bg-forest-900",
  light: "bg-paper text-forest-900 ring-1 ring-line hover:ring-forest-400",
  ghost: "text-forest-800 hover:bg-forest-100",
  /* UI/UX pass 2026-10-15 — a gold pill is a gold pill: the label is ink,
     not white. White on gold-500 measures 3.3:1, under the 4.5:1 WCAG AA
     needs for text this small; forest-950 on the same gold is 5.4:1. */
  gold: "bg-gold-500 text-forest-950 hover:bg-gold-400 shadow-sm",
  glass: "bg-white/10 text-ivory-50 ring-1 ring-white/25 hover:bg-white/20",
  /* Every size clears 44px (UI/UX pass 2026-10-15). `sm` used to be 36px
     tall — fine for a mouse, too small for the thumb that actually taps
     "continue shopping" on a phone. */
  sm: "min-h-11 px-4 py-2 text-sm",
  md: "min-h-11 px-6 py-3 text-sm",
  lg: "min-h-14 px-8 py-4 text-base",
} as const;

export function ButtonLink({
  href,
  variant = "primary",
  size = "md",
  className = "",
  children,
  ariaLabel,
}: {
  href: string;
  variant?: "primary" | "dark" | "light" | "ghost" | "gold" | "glass";
  size?: "sm" | "md" | "lg";
  className?: string;
  children: React.ReactNode;
  ariaLabel?: string;
}) {
  return (
    <Link
      href={href}
      aria-label={ariaLabel}
      className={`${btn.base} ${btn[variant]} ${btn[size]} ${className}`}
    >
      {children}
    </Link>
  );
}

export function Badge({
  kind,
  children,
}: {
  kind: "new" | "sale" | "featured";
  children?: React.ReactNode;
}) {
  const styles: Record<typeof kind, string> = {
    new: "bg-forest-800 text-ivory-50",
    /* UI/UX pass 2026-10-15 — ink on gold, not white on gold (3.3:1 →
       5.4:1). Same rule as `btn.gold` above. */
    sale: "bg-gold-500 text-forest-950",
    featured: "bg-ivory-50/95 text-forest-800 ring-1 ring-gold-300",
  };
  const label =
    children ??
    (kind === "new" ? "NEW" : kind === "sale" ? "SALE" : "FEATURED");
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.14em] ${styles[kind]}`}
    >
      {label}
    </span>
  );
}

export function Price({
  value,
  compareAt,
  size = "md",
}: {
  value: number;
  compareAt?: number;
  size?: "sm" | "md" | "lg";
}) {
  const cls =
    size === "lg" ? "text-3xl" : size === "sm" ? "text-sm" : "text-lg";
  return (
    <p className={`flex flex-wrap items-baseline gap-x-2 ${cls}`}>
      <span className="font-semibold tracking-tight text-ink">
        {formatBdt(value)}
      </span>
      {compareAt && compareAt > value ? (
        <span className="text-[0.82em] font-normal text-ink-soft line-through decoration-1">
          {formatBdt(compareAt)}
        </span>
      ) : null}
    </p>
  );
}

export function Rating({
  value,
  reviewCount,
  className = "",
}: {
  value: number;
  reviewCount?: number;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs text-ink-soft ${className}`}
    >
      <IconStar className="h-3.5 w-3.5 text-gold-500" />
      <span className="font-medium text-ink">{value.toFixed(1)}</span>
      {reviewCount !== undefined && <span>({reviewCount})</span>}
    </span>
  );
}

export function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[0.7rem] font-semibold uppercase tracking-[0.38em] text-gold-600">
      {children}
    </p>
  );
}
