"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  addLine,
  CART_STORAGE_KEY,
  removeLine,
  setQty,
  summarize,
  type CartLine,
  type CartSummary,
} from "@/lib/cart";

interface CartContextValue {
  lines: CartLine[];
  detail: CartSummary["lines"];
  itemCount: number;
  subtotal: number;
  addItem: (productId: string, variantLabel: string, qty?: number) => void;
  updateQty: (productId: string, variantLabel: string, qty: number) => void;
  removeItem: (productId: string, variantLabel: string) => void;
  clear: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);

const readStorage = (): CartLine[] => {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(CART_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as CartLine[]) : [];
  } catch {
    return [];
  }
};

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const hydrated = useRef(false);

  // Hydration-safe: initialise from localStorage after first paint.
  // (Pattern intentionally reads after mount to avoid SSR/client markup
  // mismatch — cart contents are browser-only.)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage hydration must happen post-mount
    setLines(readStorage());
    hydrated.current = true;
  }, []);

  useEffect(() => {
    if (!hydrated.current) return; // never clobber storage before first read
    try {
      window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(lines));
    } catch {
      /* storage unavailable — cart stays in memory */
    }
  }, [lines]);

  const addItem = useCallback(
    (productId: string, variantLabel: string, qty = 1) =>
      setLines((prev) => addLine(prev, productId, variantLabel, qty)),
    [],
  );

  const updateQty = useCallback(
    (productId: string, variantLabel: string, qty: number) =>
      setLines((prev) => setQty(prev, productId, variantLabel, qty)),
    [],
  );

  const removeItem = useCallback(
    (productId: string, variantLabel: string) =>
      setLines((prev) => removeLine(prev, productId, variantLabel)),
    [],
  );

  const clear = useCallback(() => setLines([]), []);

  const summary = useMemo(() => summarize(lines), [lines]);

  const value = useMemo(
    () => ({
      lines,
      detail: summary.lines,
      itemCount: summary.itemCount,
      subtotal: summary.subtotal,
      addItem,
      updateQty,
      removeItem,
      clear,
    }),
    [lines, summary, addItem, updateQty, removeItem, clear],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used inside <CartProvider>");
  return ctx;
}
