import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "PROSANTI Rider — ডেলিভারি পোর্টাল",
  description: "PROSANTI রাইডার ডেলিভারি ও ক্যাশ ম্যানেজমেন্ট পোর্টাল",
};

export default function RiderLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-ivory-50 text-ink antialiased">
      <div className="mx-auto max-w-md min-h-screen bg-paper shadow-lg ring-1 ring-line flex flex-col">
        {children}
      </div>
    </div>
  );
}
