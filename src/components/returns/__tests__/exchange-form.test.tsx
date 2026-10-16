import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { LanguageProvider } from "@/components/i18n/language-provider";
import { ExchangeForm } from "../exchange-form";

afterEach(() => cleanup());

describe("ExchangeForm Component", () => {
  it("renders the Bangla size exchange form under a Bangla provider", () => {
    render(
      <LanguageProvider initialLang="bn">
        <ExchangeForm />
      </LanguageProvider>,
    );

    expect(screen.getByText(/ইনস্ট্যান্ট সাইজ এক্সচেঞ্জ ফর্ম/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/PS-YYYYMMDD-XXXX/i)).toBeInTheDocument();
  });

  it("renders English labels by default", () => {
    render(<ExchangeForm />);

    expect(screen.getByText("Quick size exchange form")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Submit exchange request" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Your full name")).toBeInTheDocument();
  });

  it("keeps the reason values unchanged in both languages", () => {
    const { unmount } = render(<ExchangeForm />);
    const enOptions = Array.from(screen.getByRole("combobox").querySelectorAll("option")).map((o) => o.value);
    unmount();

    render(
      <LanguageProvider initialLang="bn">
        <ExchangeForm />
      </LanguageProvider>,
    );
    const bnOptions = Array.from(screen.getByRole("combobox").querySelectorAll("option")).map((o) => o.value);

    // The value is what reaches the support team — it must not follow the language.
    expect(enOptions).toEqual(bnOptions);
    expect(enOptions[0]).toBe("Size Exchange (সাইজ পরিবর্তন)");
  });
});
