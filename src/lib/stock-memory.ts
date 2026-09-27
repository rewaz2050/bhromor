/**
 * UX plan §8 (R11) — "back in stock" on the wishlist, honestly: the badge
 * appears only when THIS device last saw the piece sold out and it is on the
 * shelf now. Device-local, like the price memory; nothing invented.
 */

export const STOCK_MEMORY_KEY = "prosanti.stock-seen.v1";
const MAX_ENTRIES = 300;

export interface StockSeen {
  inStock: boolean;
  at: number;
}
export type StockMemory = Record<string, StockSeen>;

const storage = (): Storage | null => {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
};

export const sanitizeStockMemory = (raw: unknown): StockMemory => {
  if (!raw || typeof raw !== "object") return {};
  const out: StockMemory = {};
  for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!v || typeof v !== "object") continue;
    const r = v as Record<string, unknown>;
    if (typeof r.inStock !== "boolean") continue;
    out[id] = { inStock: r.inStock, at: typeof r.at === "number" && Number.isFinite(r.at) ? r.at : 0 };
  }
  return out;
};

export const readStockMemory = (): StockMemory => {
  const s = storage();
  if (!s) return {};
  try {
    return sanitizeStockMemory(JSON.parse(s.getItem(STOCK_MEMORY_KEY) ?? "null"));
  } catch {
    return {};
  }
};

/** Pieces that came back: remembered sold out, in stock now. Pure. */
export const returnedToStock = <P extends { id: string; inStock: boolean }>(
  products: readonly P[],
  memory: StockMemory,
): P[] => products.filter((p) => p.inStock && memory[p.id]?.inStock === false);

/** Remember what this device sees now (oldest entries dropped past the cap). */
export const rememberStock = (
  products: readonly { id: string; inStock: boolean }[],
  now: number = Date.now(),
): StockMemory => {
  const memory = readStockMemory();
  for (const p of products) memory[p.id] = { inStock: p.inStock, at: now };
  const ids = Object.keys(memory);
  if (ids.length > MAX_ENTRIES) {
    ids
      .sort((a, b) => memory[a]!.at - memory[b]!.at)
      .slice(0, ids.length - MAX_ENTRIES)
      .forEach((id) => delete memory[id]);
  }
  try {
    storage()?.setItem(STOCK_MEMORY_KEY, JSON.stringify(memory));
  } catch {
    /* storage blocked — the comparison simply starts fresh next time */
  }
  return memory;
};
