/**
 * Share-preview (OG) card copy rules.
 *
 * WhatsApp / Facebook / Messenger previews are how most Sunamganj shoppers
 * first see the store, so every important route answers a share with a
 * branded 1200×630 card (see src/app/**\/opengraph-image.tsx).
 *
 * The card font (next/og's bundled Noto Sans) has no Bengali glyphs, so the
 * card itself stays Latin and the taka sign is written "Tk" — a ৳ would
 * render as an empty box in the preview.
 */

export const OG_CARD_WIDTH = 1200;
export const OG_CARD_HEIGHT = 630;

/** The promise every card repeats, bottom-left. */
export const OG_TAGLINE = "Sunamganj · 45-min home delivery · Cash on delivery";

/** "149000 paisa" → "Tk 1,490" (no ৳ — the card font has no Bengali block). */
export const ogTaka = (paisa: number): string =>
  `Tk ${Math.round(paisa / 100).toLocaleString("en-IN", {
    maximumFractionDigits: 0,
  })}`;

/**
 * Long titles step down instead of shrinking to unreadable. The left card
 * column fits roughly 16 characters per line at 56px and 20 at 44px — two
 * lines is the hard ceiling, ellipsis on a word boundary.
 */
export const ogFitTitle = (raw: string): { text: string; size: number } => {
  const title = raw.replace(/\s+/g, " ").trim() || "PROSANTI";
  const cap = title.length > 26 ? 40 : 32;
  if (title.length <= cap) return { text: title, size: title.length > 26 ? 44 : 56 };
  const clipped = title.slice(0, cap - 1);
  const cut = clipped.lastIndexOf(" ");
  return {
    text: `${(cut > cap * 0.5 ? clipped.slice(0, cut) : clipped).trimEnd()}…`,
    size: 44,
  };
};

/** Two quiet lines max under the title, cut on a word boundary. */
export const ogDescriptionFor = (raw: string, max = 90): string => {
  const text = raw.replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  const clipped = text.slice(0, max - 1);
  const cut = clipped.lastIndexOf(" ");
  return `${(cut > max * 0.5 ? clipped.slice(0, cut) : clipped).trimEnd()}…`;
};

/** "https://proshanti.rahatahmed.site/x" → "proshanti.rahatahmed.site". */
export const ogHostname = (base: string): string => {
  try {
    return new URL(base).host.replace(/^www\./, "");
  } catch {
    return base.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0] || base;
  }
};

export interface OgGridPick {
  src: string;
  alt: string;
}

/**
 * Cover picks for the shop card — up to three, in-stock first, never a
 * video slide (satori cannot play one), never the same piece twice.
 */
export const ogGridPicks = (products: {
  slug: string;
  inStock: boolean;
  media: { src: string; alt: string; kind?: "image" | "video" }[];
}[]): OgGridPick[] => {
  const picks: OgGridPick[] = [];
  const seen = new Set<string>();
  const ordered = [
    ...products.filter((p) => p.inStock),
    ...products.filter((p) => !p.inStock),
  ];
  for (const product of ordered) {
    if (picks.length >= 3) break;
    if (seen.has(product.slug)) continue;
    const cover = product.media.find((m) => (m.kind ?? "image") === "image");
    if (!cover) continue;
    seen.add(product.slug);
    picks.push({ src: cover.src, alt: cover.alt || product.slug });
  }
  return picks;
};
