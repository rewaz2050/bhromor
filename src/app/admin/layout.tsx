import type { Metadata } from "next";
import AdminGate from "@/components/admin/admin-gate";

/** Admin panel — separate surface from the customer storefront (§101). */
export const metadata: Metadata = {
  title: {
    default: "Admin · PROSANTI",
    template: "%s · PROSANTI Admin",
  },
  robots: { index: false, follow: false },
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AdminGate>{children}</AdminGate>;
}
