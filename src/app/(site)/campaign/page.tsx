import type { Metadata } from "next";
import CampaignPage from "@/components/promo/campaign-page";

/**
 * /campaign — the seasonal landing (P2 #20, "Eid Mega Landing" in the brief).
 * The page itself is static chrome; everything inside is driven by the armed
 * settings document through the shared promo store, so there is nothing to
 * go stale: no campaign configured → an honest quiet page, never a placeholder.
 */

export const metadata: Metadata = {
  title: "Seasonal Drops — PROSANTI",
  description:
    "Festive drops from PROSANTI: countdowns, first-look pieces and the early-access list — priced by the real checkout, promised by the real shop.",
};

export default function CampaignPageRoute() {
  return <CampaignPage />;
}
