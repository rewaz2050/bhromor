import type { Metadata } from "next";
import type { ReactNode } from "react";
import RiderShell from "@/components/rider/rider-shell";

export const metadata: Metadata = {
  title: "PROSANTI Rider — ডেলিভারি পোর্টাল",
  description: "PROSANTI রাইডার ডেলিভারি ও ক্যাশ ম্যানেজমেন্ট পোর্টাল",
  robots: { index: false, follow: false },
};

export default function RiderLayout({ children }: { children: ReactNode }) {
  return <RiderShell>{children}</RiderShell>;
}
