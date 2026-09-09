import type { ReactNode } from "react";
import VendorShell from "@/components/vendor/vendor-shell";

export const metadata = {
  title: "Vendor dashboard · PROSANTI",
};

export default function VendorLayout({ children }: { children: ReactNode }) {
  return <VendorShell>{children}</VendorShell>;
}
