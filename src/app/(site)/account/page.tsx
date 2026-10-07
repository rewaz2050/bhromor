import type { Metadata } from "next";
import { cookies } from "next/headers";
import AccountView from "@/components/account/account-view";
import { CUSTOMER_COOKIE, resolveCustomerByToken } from "@/lib/customer-auth";

export const metadata: Metadata = {
  title: "Your account",
  robots: { index: false, follow: false },
};

/**
 * One shopper's page — never a shared CDN copy.
 *
 * The session is an httpOnly cookie, so only the SERVER can read it: it does,
 * here, before the HTML is sent. Until this change the page shipped a
 * "সেশন চেক করা হচ্ছে…" line and the browser swapped the whole block a moment
 * later — on every visit, for a shopper who may have been signed in for
 * months. Now the dashboard (or the sign-in form) is painted in the first
 * response, and the client probe only has to confirm it.
 */
export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const jar = await cookies();
  const token = jar.get(CUSTOMER_COOKIE)?.value ?? null;
  // One indexed lookup. If it fails, the page still paints — as a guest —
  // and the browser's own probe settles the truth.
  const customer = await resolveCustomerByToken(token).catch(() => null);
  return (
    <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6 lg:py-20">
      <AccountView initialCustomer={customer} />
    </div>
  );
}
