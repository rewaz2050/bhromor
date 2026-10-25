import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import ReviewsSection from "../reviews-section";
import { PRODUCTS } from "@/lib/catalog";
import { LanguageProvider } from "@/components/i18n/language-provider";
vi.mock("@/lib/use-public-reviews", () => ({
  usePublicReviews: () => ({ reviews: [], submit: vi.fn(), live: true, loading: false, error: null }),
}));
vi.mock("@/lib/use-public-settings", () => ({
  usePublicSettings: () => ({ settings: {}, loading: false }),
}));
afterEach(() => { cleanup(); localStorage.clear(); });
describe("Bengali reviews", () => {
  it("uses Bengali for the form, empty state, rating names and validation", () => {
    render(<LanguageProvider initialLang="bn"><ReviewsSection product={PRODUCTS[0]} /></LanguageProvider>);
    expect(screen.getByRole("heading", { name: "ক্রেতাদের রিভিউ" })).toBeInTheDocument();
    expect(screen.getByText("এখনো কোনো রিভিউ নেই")).toBeInTheDocument();
    expect(screen.getByLabelText("আপনার রিভিউ *")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "5 তারা" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "রিভিউ জমা দিন" }));
    expect(screen.getByRole("alert")).toHaveTextContent("আগে তারায় রেটিং দিন।");
    fireEvent.click(screen.getByRole("radio", { name: "5 তারা" }));
    fireEvent.click(screen.getByRole("button", { name: "রিভিউ জমা দিন" }));
    expect(screen.getByRole("alert")).toHaveTextContent("আর একটু বলুন — অন্তত একটি বাক্য লিখুন।");
  });
});
