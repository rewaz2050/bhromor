/** UX plan §11 (R8) — searchable, bilingual FAQ that never ends blank. */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import FaqList, { searchFaqs } from "@/components/info/faq-list";
import { LanguageProvider } from "@/components/i18n/language-provider";
import { FAQS } from "@/lib/faq";

const mount = (lang: "en" | "bn" = "bn") =>
  render(
    <LanguageProvider initialLang={lang}>
      <FaqList />
    </LanguageProvider>,
  );

beforeEach(() => {
  localStorage.clear();
  document.cookie = "prosanti-lang=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
});
afterEach(cleanup);

describe("searchFaqs", () => {
  it("matches any word in question or answer, in either script, forgiving spelling", () => {
    expect(searchFaqs(FAQS, "")).toHaveLength(FAQS.length);
    expect(searchFaqs(FAQS, "Cash").map((f) => f.id)).toEqual(["payment"]);
    // Bengali query against Bengali copy, with the ী/ি fold.
    expect(searchFaqs(FAQS, "ডেলীভারি").map((f) => f.id)).toContain("speed");
    // Every word must hit somewhere.
    expect(searchFaqs(FAQS, "track phone").map((f) => f.id)).toEqual(["account", "track"]);
    expect(searchFaqs(FAQS, "unicorn")).toEqual([]);
  });
});

describe("<FaqList>", () => {
  it("renders every question in Bengali with a Bengali-digit count, and filters as you type", () => {
    mount();
    expect(screen.getByTestId("faq-count").textContent).toBe("৮টির মধ্যে ৮টি প্রশ্ন");
    const list = screen.getByTestId("faq-list");
    expect(within(list).getByText("পেমেন্ট কীভাবে করব?")).toBeTruthy();
    expect(list.textContent).not.toMatch(/[0-9]/);

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "ক্যাশ" } });
    expect(screen.getByTestId("faq-count").textContent).toBe("৮টির মধ্যে ১টি প্রশ্ন");
    const open = screen.getByTestId("faq-list").querySelectorAll("details[open]");
    expect(open).toHaveLength(1);
    expect(open[0].textContent).toContain("ক্যাশ অন ডেলিভারি");
  });

  it("hands a miss to support instead of a blank list (English)", () => {
    mount("en");
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "unicorn" } });
    const empty = screen.getByTestId("faq-empty");
    expect(empty.textContent).toContain('Nothing matched "unicorn"');
    expect(within(empty).getByRole("link", { name: /Ask us directly/ })).toHaveAttribute("href", "/contact");
    expect(screen.queryByTestId("faq-list")).toBeNull();
  });
});
