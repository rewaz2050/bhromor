/** UX plan §11 (R8) — WhatsApp first, then the call, then e-mail; real numbers only. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import ContactChannels from "@/components/contact/contact-channels";
import { LanguageProvider } from "@/components/i18n/language-provider";

const originalFetch = globalThis.fetch;
const serve = (body: unknown, status = 200) => {
  globalThis.fetch = (() => Promise.resolve(new Response(JSON.stringify(body), { status }))) as typeof fetch;
};

beforeEach(() => serve({ phone: "01711111111", whatsapp: "01822222222", email: "hi@prosanti.app" }));
afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
});

describe("<ContactChannels>", () => {
  it("orders the cards WhatsApp → call → email and links each to the real channel", async () => {
    render(<ContactChannels />);
    await waitFor(() => expect(screen.getByTestId("contact-whatsapp")).toBeTruthy());
    const cards = screen.getAllByRole("link").filter((a) => a.getAttribute("data-testid")?.startsWith("contact-"));
    expect(cards.map((a) => a.getAttribute("data-testid"))).toEqual(["contact-whatsapp", "contact-call", "contact-email"]);
    expect(cards[0]).toHaveAttribute("href", "https://wa.me/8801822222222");
    expect(cards[1]).toHaveAttribute("href", "tel:+8801711111111");
    expect(cards[2]).toHaveAttribute("href", "mailto:hi@prosanti.app");
  });

  it("speaks Bangla to a shopper reading Bangla", () => {
    render(
      <LanguageProvider initialLang="bn">
        <ContactChannels />
      </LanguageProvider>,
    );
    // Not "Use the message form" on a shop whose default language is Bangla.
    expect(screen.getByText(/মেসেজ ফর্ম ব্যবহার করুন/)).toBeTruthy();
    expect(screen.getByText(/আমরা কোথায় কাজ করি/)).toBeTruthy();
  });

  it("paints the channels the server read, without asking again", () => {
    serve({ phone: null, whatsapp: null, email: null });
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    render(
      <ContactChannels
        initial={{ phone: "01711111111", whatsapp: "01822222222", email: "hi@prosanti.app" }}
      />,
    );
    // First render already carries them — no swap, no jump below the fold.
    expect(screen.getByTestId("contact-whatsapp")).toBeTruthy();
    expect(screen.getByTestId("contact-call")).toHaveAttribute("href", "tel:+8801711111111");
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("invents nothing when the shop has configured no channel", async () => {
    serve({ phone: null, whatsapp: null, email: null });
    render(<ContactChannels />);
    await waitFor(() => expect(screen.getByText(/Use the message form/)).toBeTruthy());
    expect(screen.queryByTestId("contact-whatsapp")).toBeNull();
  });
});
