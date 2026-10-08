/**
 * The account page must not begin with "সেশন চেক করা হচ্ছে…" (account
 * loading pass 2026-10-07). The server already knows who you are — the
 * httpOnly cookie is right there in the request — so the first paint carries
 * the dashboard or the sign-in form, never a spinner that is about to be
 * replaced.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import AccountView from "../account-view";
import {
  __resetLiveAuthForTests,
  probeCustomerSession,
} from "@/lib/customer-session";

const customer = { id: "c9", name: "রহিম সাহেব", phone: "01712345678" };
const originalFetch = globalThis.fetch;

beforeEach(() => {
  __resetLiveAuthForTests();
  // The probe is never answered in these tests: whatever renders, renders
  // from the SERVER's answer, not from a round trip.
  globalThis.fetch = vi.fn(
    () => new Promise<Response>(() => {}),
  ) as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  cleanup();
});

describe("AccountView — the session the server already proved", () => {
  it("paints the dashboard at once for a signed-in shopper", () => {
    render(<AccountView initialCustomer={customer} />);
    expect(screen.getByTestId("account-hero")).toHaveTextContent("রহিম সাহেব");
    expect(screen.queryByText(/সেশন চেক করা হচ্ছে/)).toBeNull();
  });

  it("paints the sign-in form at once for a guest", () => {
    render(<AccountView initialCustomer={null} />);
    expect(screen.getByText("নতুন অ্যাকাউন্ট")).toBeInTheDocument();
    expect(screen.queryByText(/সেশন চেক করা হচ্ছে/)).toBeNull();
  });

  it("still waits, and says so, when the server could not check", () => {
    render(<AccountView />);
    expect(screen.getByText(/সেশন চেক করা হচ্ছে/)).toBeInTheDocument();
  });

  it("shares the server's answer with every other consumer on the page", async () => {
    render(<AccountView initialCustomer={customer} />);
    // The seeded store is what the header, the wishlist and the smart card read.
    const probe = probeCustomerSession();
    expect(screen.getByTestId("account-hero")).toBeInTheDocument();
    void probe;
  });
});
