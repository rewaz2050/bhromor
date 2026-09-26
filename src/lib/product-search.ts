import type { Product } from "./catalog";

/**
 * Product search shared by the header overlay and the shop grid, so both
 * return the same matches (UX plan §1.2).
 *
 * Two kinds of tolerance, both deliberately small and readable:
 *   1. `fold()` — case, Unicode form, Latin accents, and the Bengali
 *      spellings people actually type: long/short vowels (পাঞ্জাবী/পাঞ্জাবি),
 *      nukta variants (শাড়ী/শাড়ি), শ/ষ/স and ণ/ন; hyphens and spaces are
 *      dropped so "t shirt", "t-shirt" and "tshirt" are one word.
 *   2. `SYNONYMS` — one row per garment concept in both scripts, so a
 *      Bengali query finds an English-named product and vice versa.
 */

const SYNONYMS: readonly (readonly string[])[] = [
  ["panjabi", "punjabi", "পাঞ্জাবি", "পাঞ্জাবী", "kurta", "কুর্তা"],
  ["shirt", "shirts", "শার্ট", "সার্ট"],
  ["t-shirt", "tshirt", "tee", "টি-শার্ট", "টিশার্ট", "গেঞ্জি"],
  ["lungi", "lunghi", "লুঙ্গি", "লুংগি"],
  ["gamcha", "gamchha", "গামছা"],
  [
    "three-piece",
    "3-piece",
    "3 piece",
    "থ্রি-পিস",
    "থ্রিপিস",
    "তিন পিস",
    "salwar",
    "shalwar",
    "kameez",
    "সালোয়ার",
    "সেলোয়ার",
    "কামিজ",
  ],
  ["saree", "sari", "shari", "শাড়ি", "শাড়ী"],
  ["kurti", "কুর্তি"],
  ["fatua", "fotua", "ফতুয়া"],
  ["dress", "dresses", "frock", "ড্রেস", "ফ্রক"],
  ["pant", "pants", "trouser", "trousers", "প্যান্ট"],
  ["jeans", "জিন্স"],
  ["borka", "burkha", "burqa", "বোরকা", "বোরখা"],
  ["hijab", "হিজাব"],
  ["men", "man", "gents", "পুরুষ", "পুরুষদের", "ছেলে", "ছেলেদের"],
  ["women", "woman", "ladies", "নারী", "মহিলা", "মেয়ে", "মেয়েদের"],
  ["kids", "kid", "children", "baby", "বাচ্চা", "বাচ্চাদের", "শিশু"],
  ["cotton", "কটন", "সুতি"],
  ["silk", "সিল্ক", "রেশম"],
  ["jamdani", "জামদানি"],
  ["traditional", "heritage", "ঐতিহ্য", "ঐতিহ্যবাহী"],
  ["eid", "ঈদ"],
  ["puja", "pooja", "পূজা", "পুজো"],
  ["gift", "গিফট", "উপহার"],
  ["new", "নতুন"],
  ["offer", "sale", "discount", "অফার", "ছাড়", "সেল"],
];

const BN_FOLD: Record<string, string> = {
  "\u09C0": "\u09BF", // ী → ি
  "\u09C2": "\u09C1", // ূ → ু
  "\u0988": "\u0987", // ঈ → ই
  "\u098A": "\u0989", // ঊ → উ
  "\u09A3": "\u09A8", // ণ → ন
  "\u09B6": "\u09B8", // শ → স
  "\u09B7": "\u09B8", // ষ → স
  "\u09DC": "\u09A1", // ড় → ড
  "\u09DD": "\u09A2", // ঢ় → ঢ
  "\u09DF": "\u09AF", // য় → য
  "\u09BC": "", // nukta dropped (the precomposed forms above land here too)
};

/** Canonical, compact form of a term — the only thing ever compared. */
export const foldSearchText = (value: string): string =>
  value
    .trim()
    .toLocaleLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Latin accents: café → cafe
    .normalize("NFC")
    .replace(/[\u0980-\u09FF]/g, (ch) => BN_FOLD[ch] ?? ch)
    .replace(/[\s\-_'’.,/]+/g, "");

const SYNONYM_INDEX: Map<string, readonly string[]> = (() => {
  const index = new Map<string, readonly string[]>();
  for (const row of SYNONYMS) {
    const folded = Array.from(new Set(row.map(foldSearchText)));
    for (const term of folded) index.set(term, folded);
  }
  return index;
})();

/** Every spelling that means the same as `term` (folded), `term` first. */
export const expandSearchTerm = (term: string): string[] => {
  const folded = foldSearchText(term);
  if (!folded) return [];
  const group = SYNONYM_INDEX.get(folded);
  return group ? [folded, ...group.filter((g) => g !== folded)] : [folded];
};

const haystackOf = (product: Product): string =>
  foldSearchText(
    [product.name, product.nameBn ?? "", product.subCategory, product.sku, product.category].join(" "),
  );

const hits = (hay: string, term: string): boolean =>
  expandSearchTerm(term).some((candidate) => candidate !== "" && hay.includes(candidate));

/** Shared by the header preview and the shop so both return the same matches. */
export function matchesProduct(product: Product, query: string): boolean {
  const trimmed = query.trim();
  if (!trimmed) return true;
  const hay = haystackOf(product);
  // Whole phrase first ("three piece", "সালোয়ার কামিজ"), then every word
  // must be found somewhere — "green panjabi" and "panjabi green" both work.
  if (hits(hay, trimmed)) return true;
  const words = trimmed.split(/\s+/).filter(Boolean);
  return words.length > 1 && words.every((word) => hits(hay, word));
}

export function shopSearchHref(query: string): string {
  const value = query.trim();
  return value ? `/shop?${new URLSearchParams({ q: value })}` : "/shop";
}
