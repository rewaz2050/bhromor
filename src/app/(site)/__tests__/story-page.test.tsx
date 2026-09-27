import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { LanguageProvider } from "@/components/i18n/language-provider";
import StoryPage from "../story/page";

vi.mock("@/components/info/info-rail", () => ({ default: () => null }));

describe("/story (UX plan §11, R9)", () => {
  beforeEach(() => {
    localStorage.clear();
    document.cookie = "prosanti-lang=; max-age=0; path=/";
  });

  it("is image-heavy and chaptered: cloth, hands, town, calm — Bengali by default", () => {
    render(
      <LanguageProvider initialLang="bn">
        <StoryPage />
      </LanguageProvider>,
    );
    expect(screen.getByRole("heading", { level: 1 }).textContent).toContain("কাপড়, হাত,");
    for (const id of ["cloth", "hands", "town"]) {
      expect(screen.getByTestId(`story-chapter-${id}`)).toBeInTheDocument();
    }
    expect(screen.getByText(/সুনামগঞ্জের দোকান/)).toBeInTheDocument();
    // at least the opening, three chapter images, three details and the closing frame
    expect(document.querySelectorAll("img").length).toBeGreaterThanOrEqual(8);
    expect(screen.getByRole("link", { name: /তাক থেকে কিনুন/ }).getAttribute("href")).toBe("/shop");
    expect(screen.getByRole("link", { name: /দোকানগুলো দেখুন/ }).getAttribute("href")).toBe("/shops");
  });

  it("reads in English after the one-tap toggle", () => {
    render(
      <LanguageProvider initialLang="en">
        <StoryPage />
      </LanguageProvider>,
    );
    expect(screen.getByRole("heading", { level: 1 }).textContent).toContain("The cloth, the hands,");
    expect(screen.getByText(/Sunamganj shops, on one shelf/)).toBeInTheDocument();
  });
});
