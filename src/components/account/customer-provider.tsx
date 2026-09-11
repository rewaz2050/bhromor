"use client";

import type { ReactNode } from "react";
import { AccountWishlistProvider } from "./account-wishlist-provider";
import { useCustomer } from "@/lib/use-customer";

/**
 * Customer session is now phone+password with no verification step
 * (see lib/customer-session.ts + /api/account/*). The Supabase auth client
 * is no longer used for storefront sign-in; the account wishlist provider
 * stays mounted in guest mode so device-local favourites keep working.
 */
export { useCustomer };

export default function CustomerProvider({
  children,
}: {
  children: ReactNode;
}) {
  const { customer, checked } = useCustomer();
  return (
    <AccountWishlistProvider
      key={customer?.id ?? "guest"}
      client={null}
      userId={customer?.id ?? null}
      authLoading={!checked}
    >
      {children}
    </AccountWishlistProvider>
  );
}
