import type { Metadata } from "next";
import AccountView from "@/components/account/account-view";

export const metadata: Metadata = {
  title: "Your account",
  robots: { index: false, follow: false },
};
export default function AccountPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6 lg:py-20">
      <AccountView />
    </div>
  );
}
