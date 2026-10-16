/**
 * The profile section follows the storefront language: English by default,
 * Bangla when the shopper's language is Bangla.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { LanguageProvider } from "@/components/i18n/language-provider";
import { CustomerProfile } from "../customer-profile";

const customer = { name: "রহিম", phone: "01712345678" } as Parameters<typeof CustomerProfile>[0]["customer"];

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("CustomerProfile — language", () => {
  it("renders English by default", () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 500 })));
    render(
      <LanguageProvider>
        <CustomerProfile customer={customer} onSaved={async () => {}} />
      </LanguageProvider>,
    );
    expect(screen.getByRole("heading", { name: "My details" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save details" })).toBeInTheDocument();
    expect(screen.queryByText("আমার তথ্য")).toBeNull();
  });

  it("renders Bangla when the language is Bangla", () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 500 })));
    render(
      <LanguageProvider initialLang="bn">
        <CustomerProfile customer={customer} onSaved={async () => {}} />
      </LanguageProvider>,
    );
    expect(screen.getByRole("heading", { name: "আমার তথ্য" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "তথ্য সেভ করুন" })).toBeInTheDocument();
    expect(screen.queryByText("Save details")).toBeNull();
  });
});
