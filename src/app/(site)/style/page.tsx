import type { Metadata } from "next";
import StyleMatchPanel from "@/components/shop/style-match-panel";

/**
 * /style — Style Match (P2 #19). A recommender built from the shop's own
 * catalog and rules; deliberately NOT an "AI chatbot" costume: the brief's
 * image-upload vision model needs a provider that doesn't exist in this
 * stack, so this page promises only what deterministic data can deliver.
 * If an LLM is ever configured, it speaks through this same query contract.
 */

export const metadata: Metadata = {
  title: "Style Match — PROSANTI",
  description:
    "Tell PROSANTI your size, budget and occasion — real catalog pieces shortlisted with printed reasons.",
};

export default function StylePage() {
  return <StyleMatchPanel />;
}
