import type { Metadata } from "next";
import AccountView from "@/components/account/account-view";
import { Eyebrow } from "@/components/ui/primitives";

export const metadata: Metadata = {
  title: "Your account",
  robots: { index: false, follow: false },
};
export default function AccountPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6 lg:py-20">
      <Eyebrow>A space of your own</Eyebrow>
      <h1 className="mb-8 mt-4 font-display text-4xl text-forest-900 sm:text-5xl">
        Your account.
      </h1>
      <AccountView />
    </div>
  );
}
