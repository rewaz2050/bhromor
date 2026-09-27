/** UX plan §1.4 (R9) — bilingual leaf for server pages. */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import L from "@/components/i18n/l";
import { LanguageProvider } from "@/components/i18n/language-provider";

const resetLang = () => {
  localStorage.clear();
  document.cookie = "prosanti-lang=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
};
beforeEach(resetLang);
afterEach(cleanup);

describe("<L>", () => {
  it("prints Bengali under bn, English under en, and falls back to English when bn is missing", () => {
    render(
      <LanguageProvider initialLang="bn">
        <p data-testid="a"><L en="Returns" bn="ফেরত" /></p>
        <p data-testid="b"><L en="Only English" /></p>
      </LanguageProvider>,
    );
    expect(screen.getByTestId("a").textContent).toBe("ফেরত");
    expect(screen.getByTestId("b").textContent).toBe("Only English");
    cleanup();
    resetLang();
    render(
      <LanguageProvider initialLang="en">
        <p data-testid="a"><L en="Returns" bn="ফেরত" /></p>
      </LanguageProvider>,
    );
    expect(screen.getByTestId("a").textContent).toBe("Returns");
  });
});
