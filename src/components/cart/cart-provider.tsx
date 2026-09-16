"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { getProductsSnapshot, subscribeLiveCatalog } from "@/lib/live-catalog";
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
  bagOpen: boolean;
  openBag: () => void;
  closeBag: () => void;
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
  const [bagOpen, setBagOpen] = useState(false);
  const openBag = useCallback(() => setBagOpen(true), []);
  const closeBag = useCallback(() => setBagOpen(false), []);
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

  // Keep tabs in step: two open tabs used to overwrite each other's cart,
  // and the badge in one tab never noticed a checkout in the other.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== null && event.key !== CART_STORAGE_KEY) return;
      setLines(readStorage());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

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

  // Recompute whenever the live catalog swaps in — a cart restored before
  // /api/products answered must fill itself when the rows arrive, without
  // waiting for the next user action (P: registry is empty until live).
  const catalogPool = useSyncExternalStore(
    subscribeLiveCatalog,
    getProductsSnapshot,
    getProductsSnapshot,
  );
  const summary = useMemo(() => summarize(lines, catalogPool), [lines, catalogPool]);

  const value = useMemo(
    () => ({
      bagOpen,
      openBag,
      closeBag,
      lines,
      detail: summary.lines,
      itemCount: summary.itemCount,
      subtotal: summary.subtotal,
      addItem,
      updateQty,
      removeItem,
      clear,
    }),
    [
      bagOpen,
      openBag,
      closeBag,
      lines,
      summary,
      addItem,
      updateQty,
      removeItem,
      clear,
    ],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used inside <CartProvider>");
  return ctx;
}
