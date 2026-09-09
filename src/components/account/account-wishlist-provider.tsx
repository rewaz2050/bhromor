"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  readAccountWishlist,
  removeAccountItems,
  saveAccountItems,
} from "@/lib/account-wishlist";
import { useLiveCatalog } from "@/lib/use-live-catalog";
import { getWishlist } from "@/lib/wishlist-store";

interface AccountWishlistState {
  ids: string[];
  ready: boolean;
  busy: boolean;
  error: string;
  toggle: (id: string) => Promise<boolean>;
  clear: () => Promise<boolean>;
  importGuest: () => Promise<boolean>;
  refresh: () => Promise<boolean>;
}
const Context = createContext<AccountWishlistState | null>(null);
export const useAccountWishlist = () => useContext(Context);

export function AccountWishlistProvider({
  client,
  userId,
  authLoading,
  children,
}: {
  client: SupabaseClient | null;
  userId: string | null;
  authLoading: boolean;
  children: React.ReactNode;
}) {
  if (!authLoading && (!client || !userId))
    return <Context.Provider value={null}>{children}</Context.Provider>;
  return (
    <CloudWishlist client={client} userId={userId}>
      {children}
    </CloudWishlist>
  );
}

function CloudWishlist({
  client,
  userId,
  children,
}: {
  client: SupabaseClient | null;
  userId: string | null;
  children: React.ReactNode;
}) {
  const [ids, setIds] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const locked = useRef(false);
  const active = useRef(true);
  // Live-mode ids are uuids — slug mapping must use the serving catalog.
  // Synced via effect: ref writes during render break concurrent mode.
  const { products: servingProducts } = useLiveCatalog();
  const productsRef = useRef(servingProducts);
  useEffect(() => {
    productsRef.current = servingProducts;
  }, [servingProducts]);

  const run = useCallback(
    async (write?: () => Promise<void>) => {
      if (!client || !userId || locked.current) return false;
      locked.current = true;
      setBusy(true);
      setError("");
      try {
        if (write) await write();
        const next = await readAccountWishlist(client, userId, productsRef.current);
        if (active.current) {
          setIds(next);
          setReady(true);
        }
        return true;
      } catch {
        if (active.current) {
          setReady(false);
          setError(
            "Wishlist sync failed. Check your connection and retry. Your saved items have not been replaced with guest data.",
          );
        }
        return false;
      } finally {
        locked.current = false;
        if (active.current) setBusy(false);
      }
    },
    [client, userId],
  );

  useEffect(() => {
    active.current = true;
    // Refresh on mount and focus; account data is never copied into guest storage.
    void run();
    const refresh = () => {
      void run();
    };
    window.addEventListener("focus", refresh);
    return () => {
      active.current = false;
      window.removeEventListener("focus", refresh);
    };
  }, [run]);

  const toggle = async (id: string) => {
    if (!ready || !client || !userId) return false;
    return run(() =>
      ids.includes(id)
        ? removeAccountItems(client, userId, id, productsRef.current)
        : saveAccountItems(client, userId, [id], productsRef.current),
    );
  };
  const clear = async () =>
    ready && client && userId
      ? run(() => removeAccountItems(client, userId, undefined, productsRef.current))
      : false;
  const importGuest = async () =>
    ready && client && userId
      ? run(() => saveAccountItems(client, userId, getWishlist(), productsRef.current))
      : false;

  return (
    <Context.Provider
      value={{
        ids,
        ready,
        busy,
        error,
        toggle,
        clear,
        importGuest,
        refresh: run,
      }}
    >
      {children}
    </Context.Provider>
  );
}
