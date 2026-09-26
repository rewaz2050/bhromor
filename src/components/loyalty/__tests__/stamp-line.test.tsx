/** UX plan §8 (R6) — loyalty visible outside the account page. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import StampLine, { ordinal, stampSentence } from "@/components/loyalty/stamp-line";
import { LanguageProvider } from "@/components/i18n/language-provider";
import { translations } from "@/lib/translations";

const cardState = vi.hoisted(() => ({ card: null as null | Record<string, unknown> }));
vi.mock("@/lib/use-smart-card", () => ({
  useSmartCard: () => ({ card: cardState.card, signedIn: !!cardState.card, loading: false }),
}));

const tEn = (k: "bag.stampLine" | "bag.stampLineFull") =>
  translations.en.bag[k.slice(4) as "stampLine" | "stampLineFull"];
const tBn = (k: "bag.stampLine" | "bag.stampLineFull") =>
  translations.bn.bag[k.slice(4) as "stampLine" | "stampLineFull"];

beforeEach(() => {
  cardState.card = null;
  localStorage.clear();
  document.cookie = "prosanti-lang=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
});
afterEach(cleanup);

describe("ordinal", () => {
  it("speaks both languages", () => {
    expect([1, 2, 3, 4, 7, 11, 12, 13, 21, 22].map((n) => ordinal(n, "en"))).toEqual([
      "1st", "2nd", "3rd", "4th", "7th", "11th", "12th", "13th", "21st", "22nd",
    ]);
    expect([1, 2, 3, 4, 6, 7, 10].map((n) => ordinal(n, "bn"))).toEqual([
      "১ম", "২য়", "৩য়", "৪র্থ", "৬ষ্ঠ", "৭ম", "১০ম",
    ]);
  });
});

describe("stampSentence", () => {
  const card = { enabled: true, target: 10, afterOrderStamps: 7, rewardTitle: "a free gamcha" };
  it("counts this order's stamp and what is left, in Bengali digits when bn", () => {
    expect(stampSentence(card, tEn, "en")).toBe("This order = your 7th stamp — 3 more to a free gamcha");
    const bn = stampSentence(card, tBn, "bn")!;
    expect(bn).toContain("৭ম স্ট্যাম্প");
    expect(bn).toContain("আর ৩টিতে");
    expect(bn).not.toMatch(/\d/);
  });
  it("celebrates the completing order and stays quiet without a live, enabled card", () => {
    expect(stampSentence({ ...card, afterOrderStamps: 10 }, tEn, "en")).toBe(
      "This order completes your card — a free gamcha unlocked!",
    );
    expect(stampSentence(null, tEn, "en")).toBeNull();
    expect(stampSentence({ ...card, enabled: false }, tEn, "en")).toBeNull();
    expect(stampSentence({ ...card, rewardTitle: "" }, tBn, "bn")).toContain("উপহার");
  });
});

describe("<StampLine>", () => {
  it("renders nothing for a visitor without a card", () => {
    render(
      <LanguageProvider initialLang="bn">
        <StampLine />
      </LanguageProvider>,
    );
    expect(screen.queryByTestId("stamp-line")).not.toBeInTheDocument();
  });
  it("links the cardholder's sentence to the account page", () => {
    cardState.card = { enabled: true, target: 10, afterOrderStamps: 7, rewardTitle: "ফ্রি গামছা" };
    render(
      <LanguageProvider initialLang="bn">
        <StampLine />
      </LanguageProvider>,
    );
    const line = screen.getByTestId("stamp-line");
    expect(line).toHaveAttribute("href", "/account");
    expect(line).toHaveTextContent("এই অর্ডারে ৭ম স্ট্যাম্প — আর ৩টিতে ফ্রি গামছা");
  });
});
