/** UX plan §11 (R10) — privacy & terms read fully in Bengali, and still in English. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { LanguageProvider } from "@/components/i18n/language-provider";
import PrivacyPage from "../privacy/page";
import TermsPage from "../terms/page";

vi.mock("@/components/info/info-rail", () => ({ default: () => null }));

const mount = (Page: () => React.JSX.Element, lang: "en" | "bn") =>
  render(
    <LanguageProvider initialLang={lang}>
      <Page />
    </LanguageProvider>,
  );

beforeEach(() => {
  localStorage.clear();
  document.cookie = "prosanti-lang=; max-age=0; path=/";
});
afterEach(cleanup);

describe("/privacy", () => {
  it("is Bengali end to end — headings, bullets and the contact link", () => {
    mount(PrivacyPage, "bn");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("গোপনীয়তা নীতি");
    const headings = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual([
      "যে তথ্য আমরা নিই",
      "কীভাবে ব্যবহার করি",
      "কার সাথে ভাগ হয়",
      "অবস্থান",
      "সংরক্ষণ ও আপনার অধিকার",
      "যোগাযোগ",
    ]);
    expect(screen.getByText(/রিভিউটা যাচাই করা কেনাকাটা হলে/)).toBeInTheDocument();
    expect(screen.getByText(/কোনো ভেরিফিকেশন কোড বা ইমেইল লাগে না/)).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "যোগাযোগ পেজ" })[0]).toHaveAttribute("href", "/contact");
    expect(document.body.textContent).not.toMatch(/Information we collect/);
  });

  it("still reads in English", () => {
    mount(PrivacyPage, "en");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Privacy policy");
    expect(screen.getByText(/browser notifications or WhatsApp/)).toBeInTheDocument();
  });
});

describe("/terms", () => {
  it("is Bengali end to end with the returns link kept", () => {
    mount(TermsPage, "bn");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("শর্তাবলি");
    const headings = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual([
      "অর্ডার ও দাম",
      "ডেলিভারি",
      "পেমেন্ট",
      "ফেরত ও দায়বদ্ধতা",
      "কনটেন্ট ও আচরণ",
      "দায়ের সীমা",
      "পরিবর্তন ও যোগাযোগ",
    ]);
    expect(screen.getByRole("link", { name: "ফেরত ও বদল নীতি" })).toHaveAttribute("href", "/returns");
    expect(screen.getByText(/৪৫–৫০ মিনিটের সময়সীমা/)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/Orders & pricing/);
  });

  it("still reads in English", () => {
    mount(TermsPage, "en");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Terms & conditions");
    expect(screen.getByRole("link", { name: "Returns & Exchange policy" })).toHaveAttribute("href", "/returns");
  });
});
