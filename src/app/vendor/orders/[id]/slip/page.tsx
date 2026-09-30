"use client";

/**
 * A6 — /vendor/orders/[id]/slip. The route only unwraps the params promise
 * (Next 15/16 client pages) and hands the id to the view, so the sheet
 * itself stays a testable component.
 */

import { use } from "react";
import PackingSlipView from "@/components/vendor/packing-slip-view";

export default function PackingSlipPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <PackingSlipView id={id} />;
}
