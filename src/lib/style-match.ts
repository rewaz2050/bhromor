/**
 * Style Match (P2 #19) — "tell me your body, budget and occasion; I'll
 * suggest."
 *
 * An honest AI-shaped feature without the AI theatre: no API key exists in
 * this stack, so nothing pretends to be a model. The engine below scores the
 * REAL live catalog with REAL rules — a shopper's saved size (from their own
 * size-finder profile), a budget number, colour words, and occasion
 * keywords mapped to this shop's actual subcategories. Every suggestion
 * carries the reason list that produced its score, so a shopper can audit
 * the "AI" — and if a language model is ever wired in, it plugs in behind
 * this same query→reasons contract, not a fake chat persona.
 */

import type { Product } from "./catalog";

export interface StyleQuery {
  /** free text from the occasion select — one of STYLE_OCCASIONS ids */
  occasion?: string;
  /** taka */
  budgetTaka?: number | null;
  /** colour words, lowercased */
  colors?: string[];
  /** size the shopper needs, e.g. "L" / "One Size" */
  size?: string | null;
  /** optional category narrowing */
  categoryId?: string | null;
}

export interface StyleMatch {
  product: Product;
  score: number;
  reasons: string[];
}

/** Kept small and real: each occasion maps to subcategories THIS catalog holds. */
export const STYLE_OCCASIONS = [
  {
    id: "eid",
    label: "Eid & family gatherings",
    labelBn: "ঈদ ও পারিবারিক অনুষ্ঠান",
    subcategories: ["panjabi", "three-piece", "gamcha", "kurta"],
  },
  {
    id: "office",
    label: "Office & formal",
    labelBn: "অফিস ও ফরমাল",
    subcategories: ["shirts", "trousers", "pajama"],
  },
  {
    id: "casual",
    label: "Everyday casual",
    labelBn: "প্রতিদিনের ক্যাজুয়াল",
    subcategories: ["t-shirts", "lungi", "polo"],
  },
  {
    id: "wedding",
    label: "Wedding / gaye holud",
    labelBn: "গয়ে হলুদ ও বিয়ে",
    subcategories: ["panjabi", "three-piece", "saree", "shawl", "dupatta"],
  },
] as const;

export type StyleOccasionId = (typeof STYLE_OCCASIONS)[number]["id"];

export const isStyleQueryEmpty = (q: StyleQuery): boolean =>
  !q.occasion &&
  (q.budgetTaka === null || q.budgetTaka === undefined) &&
  (!q.colors || q.colors.length === 0) &&
  !q.size &&
  !q.categoryId;

const norm = (s: string): string => s.toLowerCase().trim();

const occasionBumps = (q: StyleQuery): Set<string> => {
  const hit = STYLE_OCCASIONS.find((o) => o.id === q.occasion);
  return new Set(hit ? hit.subcategories.map(norm) : []);
};

/**
 * Score one product against the query. Rules are weighted so every point
 * earned has a printed reason — a score you cannot explain is a score you
 * should not show.
 */
export const scoreProduct = (p: Product, q: StyleQuery): { score: number; reasons: string[] } | null => {
  let score = 0;
  const reasons: string[] = [];

  // Hard gates — failing these is never a "low score", it is "not offered".
  if (!p.inStock) return null;
  if (q.categoryId && p.category !== q.categoryId) return null;
  if (q.size && q.size !== "One Size" && !p.sizes.some((s) => norm(s) === norm(q.size!))) {
    return null; // can't wear what this piece doesn't sell in your size
  }
  if (q.size === "One Size" && p.sizes.length > 0 && !p.sizes.some((s) => norm(s) === "one size")) {
    return null;
  }

  if (q.size) {
    score += 30;
    reasons.push(`Sold in your size (${q.size})`);
  }

  if (q.budgetTaka != null && q.budgetTaka > 0) {
    const budgetPaisa = q.budgetTaka * 100;
    if (p.price <= budgetPaisa) {
      const headroom = (budgetPaisa - p.price) / budgetPaisa; // 0..1 under budget
      score += Math.round(25 * (1 - headroom) + 15); // closer to budget = better use of it
      reasons.push(`${Math.round((p.price / 100 / budgetPaisa) * 100)}% of your budget`);
    } else {
      return null; // over budget is over — never a "near miss"
    }
  }

  const occ = occasionBumps(q);
  if (occ.size > 0) {
    const sub = norm(p.subCategory);
    if (occ.has(sub)) {
      score += 25;
      reasons.push(`a ${p.subCategory} — made for this occasion`);
    } else {
      return null; // occasion means something; unrelated pieces are not "low scores"
    }
  }

  if (q.colors && q.colors.length > 0) {
    const want = q.colors.map(norm);
    const have = p.colors.map(norm);
    const hit = have.find((c) => want.some((w) => c.includes(w) || w.includes(c)));
    if (hit) {
      score += 15;
      reasons.push(`comes in ${p.colors[have.indexOf(hit)]}`);
    }
  }

  if (p.featured) {
    score += 5;
    reasons.push("a shop pick");
  }
  if (p.unitsSold != null && p.unitsSold > 0) {
    score += Math.min(10, p.unitsSold);
    reasons.push(`${p.unitsSold} sold from real orders`);
  }

  if (reasons.length === 0) return null; // nothing said why → nothing to rank
  return { score, reasons };
};

/** Rank the catalog for a query. Returns at most `limit` explained matches. */
export const styleMatch = (products: Product[], q: StyleQuery, limit = 8): StyleMatch[] => {
  if (isStyleQueryEmpty(q)) return [];
  const out: StyleMatch[] = [];
  for (const p of products) {
    const s = scoreProduct(p, q);
    if (s) out.push({ product: p, score: s.score, reasons: s.reasons });
  }
  out.sort(
    (a, b) =>
      b.score - a.score ||
      a.product.price - b.product.price || // same score → kinder price first
      a.product.name.localeCompare(b.product.name),
  );
  return out.slice(0, limit);
};
