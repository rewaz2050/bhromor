/** UX plan §11 (R8) — WhatsApp first, then the call, then e-mail; real numbers only. */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import ContactChannels from "@/components/contact/contact-channels";

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

  it("invents nothing when the shop has configured no channel", async () => {
    serve({ phone: null, whatsapp: null, email: null });
    render(<ContactChannels />);
    await waitFor(() => expect(screen.getByText(/Use the message form/)).toBeTruthy());
    expect(screen.queryByTestId("contact-whatsapp")).toBeNull();
  });
});
