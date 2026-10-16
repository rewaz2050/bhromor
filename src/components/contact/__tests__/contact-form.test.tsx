/**
 * The contact form follows the storefront language: English copy by default,
 * Bangla copy (and Bangla digits in the success line) when the shopper's
 * language is Bangla. Validation messages still come from lib/engagement.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import ContactForm from "@/components/contact/contact-form";
import { LanguageProvider } from "@/components/i18n/language-provider";

const fill = (container: HTMLElement) => {
  const form = container.querySelector("form")!;
  fireEvent.change(form.querySelector('input[autocomplete="name"]')!, {
    target: { value: "রহিম করিম" },
  });
  fireEvent.change(form.querySelector('input[type="tel"]')!, {
    target: { value: "01712345678" },
  });
  fireEvent.change(form.querySelector("textarea")!, {
    target: { value: "আমার অর্ডারের তথ্য জানতে চাই, দয়া করে জানাবেন।" },
  });
  return form;
};

describe("ContactForm — language", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("renders English by default", () => {
    render(
      <LanguageProvider>
        <ContactForm />
      </LanguageProvider>,
    );
    expect(screen.getByRole("heading", { name: "Send us a message" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Send message" })).toBeTruthy();
    expect(screen.getByText("Name")).toBeTruthy();
  });

  it("renders Bangla when the language is Bangla", () => {
    render(
      <LanguageProvider initialLang="bn">
        <ContactForm />
      </LanguageProvider>,
    );
    expect(screen.getByRole("heading", { name: "আমাদের বার্তা পাঠান" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "বার্তা পাঠান" })).toBeTruthy();
    expect(screen.getByText("নাম")).toBeTruthy();
    expect(screen.getByText("বার্তা")).toBeTruthy();
    expect(screen.queryByText("Send message")).toBeNull();
  });

  it("confirms in Bangla with the first name and Bangla support hours", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ sent: true }), { status: 200 })),
    );
    const { container } = render(
      <LanguageProvider initialLang="bn">
        <ContactForm />
      </LanguageProvider>,
    );
    fireEvent.submit(fill(container));
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "বার্তা পেয়েছি" })).toBeTruthy(),
    );
    expect(screen.getByText(/ধন্যবাদ, রহিম।/)).toBeTruthy();
    expect(screen.getByText(/শনি–বৃহস্পতি, সকাল ৯টা–রাত ৯টা/)).toBeTruthy();
  });

  it("shows the first validation problem in Bangla and never sends", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { container } = render(
      <LanguageProvider initialLang="bn">
        <ContactForm />
      </LanguageProvider>,
    );
    const form = container.querySelector("form")!;
    fireEvent.change(form.querySelector("textarea")!, {
      target: { value: "আমার অর্ডার নিয়ে প্রশ্ন আছে।" },
    });
    fireEvent.submit(form);
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toBe("আপনার নাম লিখুন।");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("labels topics in Bangla but keeps the English value the server expects", () => {
    const { container } = render(
      <LanguageProvider initialLang="bn">
        <ContactForm />
      </LanguageProvider>,
    );
    const options = Array.from(container.querySelectorAll("select option")) as HTMLOptionElement[];
    expect(options[0].textContent).toBe("অর্ডার সাপোর্ট");
    expect(options[0].value).toBe("Order support");
    expect(options[3].value).toBe("Return / exchange");
  });
});
