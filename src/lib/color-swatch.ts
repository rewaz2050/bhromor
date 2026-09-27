/**
 * Colour-name → swatch (UX plan §1.1, R9). Vendors type colour names
 * freely ("Forest Green", "Red & Cream", "সবুজ"); the card wants a dot,
 * not a word. We resolve by keyword — every colour word we recognise in
 * the name becomes a stripe, so "Red & Cream" is a two-tone dot — and
 * answer null for anything we cannot honestly render (the card then keeps
 * the name as text instead of guessing a colour).
 */

const WORDS: [RegExp, string][] = [
  // Specific shades first — each may swallow its generic word ("forest green"
  // is one colour, not two) so the generic rules below never double-count.
  [/\b(off[- ]?white|ivory|cream|ecru|bone)( white)?\b|ক্রিম|আইভরি/i, "#f3ead8"],
  [/\bwhite\b|সাদা/i, "#fbfbf7"],
  [/\b(jet|onyx)( black)?\b|\bblack\b|কালো/i, "#161616"],
  [/\b(charcoal|graphite|anthracite)( gr[ae]y)?\b/i, "#3a3d40"],
  [/\b(slate|ash|silver|steel)( gr[ae]y| blue)?\b|\bgr[ae]y\b|ধূসর|রুপালি|ছাই/i, "#8d949c"],
  [/\b(navy|midnight|indigo)( blue)?\b|নেভি/i, "#1f2a5a"],
  [/\b(royal|cobalt|sapphire)( blue)?\b/i, "#2646c9"],
  [/\b(sky|powder|baby|light)( blue)\b|\bsky\b|আকাশি/i, "#9fc9ee"],
  [/\bteal( blue| green)?\b/i, "#1f6f78"],
  [/\b(turquoise|aqua|cyan)( blue)?\b/i, "#3cb8c3"],
  [/\bblue\b|নীল/i, "#3b63b8"],
  [/\b(forest|bottle|hunter)( green)?\b/i, "#1f4d36"],
  [/\b(emerald|jade)( green)?\b/i, "#1f8a5b"],
  [/\b(olive|khaki|moss)( green)?\b|জলপাই/i, "#7b7a3f"],
  [/\b(mint|sage|pistachio)( green)?\b/i, "#b8d8b4"],
  [/\blime( green)?\b/i, "#a7cf3a"],
  [/\bgreen\b|সবুজ/i, "#2f7a4a"],
  [/\b(maroon|burgundy|wine|oxblood)( red)?\b|মেরুন|খয়েরি/i, "#6b1e2b"],
  [/\b(crimson|scarlet|cherry)( red)?\b/i, "#c0182c"],
  [/\bred\b|লাল/i, "#c62828"],
  [/\b(rust|terracotta|brick|copper)( orange| brown| red)?\b/i, "#b45a2b"],
  [/\b(coral|salmon)( pink| red)?\b/i, "#f08070"],
  [/\b(peach|apricot)\b/i, "#f7c3a1"],
  [/\borange\b|কমলা/i, "#ee7a1a"],
  [/\bmustard( yellow)?\b|সরিষা/i, "#d4a017"],
  [/\b(gold|golden|brass)( yellow)?\b|সোনালি/i, "#c9a227"],
  [/\b(yellow|lemon)\b|হলুদ/i, "#f2c94c"],
  [/\b(beige|sand|tan|camel|oat|stone|taupe)( brown)?\b/i, "#cdb896"],
  [/\b(chocolate|coffee|mocha|walnut|chestnut)( brown)?\b|\bbrown\b|বাদামি/i, "#6b4a2b"],
  [/\b(magenta|fuchsia|hot pink)\b/i, "#d6338f"],
  [/\b(blush|rose|dusty)( pink)?\b|\bpink\b|গোলাপি/i, "#e8a2b4"],
  [/\b(lavender|lilac)( purple)?\b/i, "#c3b1e1"],
  [/\b(plum|aubergine|mauve)( purple)?\b|\b(purple|violet)\b|বেগুনি/i, "#6d3f8f"],
];

/** Every colour we recognise in the name, in the order they appear. */
export const swatchColors = (name: string): string[] => {
  const hits: { at: number; css: string }[] = [];
  let rest = name;
  for (const [re, css] of WORDS) {
    const m = re.exec(rest);
    if (!m) continue;
    if (!hits.some((h) => h.css === css)) hits.push({ at: m.index, css });
    // Blank the matched span so a generic rule cannot re-read it.
    rest = rest.slice(0, m.index) + " ".repeat(m[0].length) + rest.slice(m.index + m[0].length);
  }
  return hits.sort((a, b) => a.at - b.at).map((h) => h.css).slice(0, 3);
};

/** CSS `background` for the dot — a flat colour or hard stripes — or null. */
export const swatchBackground = (name: string): string | null => {
  const colors = swatchColors(name);
  if (colors.length === 0) return null;
  if (colors.length === 1) return colors[0];
  const step = 100 / colors.length;
  const stops = colors.map((c, i) => `${c} ${i * step}% ${(i + 1) * step}%`).join(", ");
  return `linear-gradient(135deg, ${stops})`;
};
