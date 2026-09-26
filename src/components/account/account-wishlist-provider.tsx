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
  // Guest (device list) when there is no cloud client at all — nothing to
  // wait for — or once the session probe has answered without a user.
  // While a cloud client is still resolving the session, the account list
  // stays authoritative so a signed-in shopper never sees guest data flash.
  const guest = !client || (!authLoading && !userId);
  // One element type at this position, always. This used to switch between
  // a bare provider and <CloudWishlist> when the probe settled, which
  // remounted the entire storefront under it (header, page, footer) about a
  // second after load — closing whatever the shopper had just opened,
  // dropping typed text and replaying every entrance animation.
  return (
    <CloudWishlist client={client} userId={userId} guest={guest}>
      {children}
    </CloudWishlist>
  );
}

function CloudWishlist({
  client,
  userId,
  guest,
  children,
}: {
  client: SupabaseClient | null;
  userId: string | null;
  guest: boolean;
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
      value={
        guest
          ? null
          : {
              ids,
              ready,
              busy,
              error,
              toggle,
              clear,
              importGuest,
              refresh: run,
            }
      }
    >
      {children}
    </Context.Provider>
  );
}
