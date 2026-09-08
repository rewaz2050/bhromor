"use client";

import { createContext, useContext, useEffect, useState } from "react";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { AccountWishlistProvider } from "./account-wishlist-provider";

interface CustomerState {
  client: SupabaseClient | null;
  session: Session | null;
  loading: boolean;
}
const CustomerContext = createContext<CustomerState>({
  client: null,
  session: null,
  loading: true,
});
export const useCustomer = () => useContext(CustomerContext);

export default function CustomerProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [state, setState] = useState<CustomerState>({
    client: null,
    session: null,
    loading: true,
  });
  useEffect(() => {
    const client = getSupabaseBrowser();
    if (!client) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- configuration is evaluated after hydration
      setState({ client: null, session: null, loading: false });
      return;
    }
    const { data } = client.auth.onAuthStateChange((_event, session) => {
      setState({ client, session, loading: false });
    });
    return () => data.subscription.unsubscribe();
  }, []);
  return (
    <CustomerContext.Provider value={state}>
      <AccountWishlistProvider
        key={state.session?.user.id ?? (state.loading ? "loading" : "guest")}
        client={state.client}
        userId={state.session?.user.id ?? null}
        authLoading={state.loading}
      >
        {children}
      </AccountWishlistProvider>
    </CustomerContext.Provider>
  );
}
