import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import Newsletter, { newsletterSignupUrl } from "../newsletter";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Newsletter opt-in", () => {
  it("collects emails through the live subscription API", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ subscribed: true }),
      }),
    );
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);
    render(<Newsletter />);

    fireEvent.change(screen.getByRole("textbox", { name: "Email address" }), {
      target: { value: "rahim@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Join the list" }));

    await screen.findByText(/you’re on the list/i);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/newsletter/subscribe",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("surfaces a server rejection without claiming success", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: false,
        status: 503,
        json: () => Promise.resolve({ error: "Newsletter is unavailable." }),
      }),
    );
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);
    render(<Newsletter />);

    fireEvent.change(screen.getByRole("textbox", { name: "Email address" }), {
      target: { value: "rahim@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Join the list" }));

    await screen.findByRole("alert");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Newsletter is unavailable.",
    );
    expect(screen.queryByText(/you’re on the list/i)).not.toBeInTheDocument();
  });

  it("links to an explicitly configured secure hosted opt-in page", () => {
    render(<Newsletter signupUrl="https://example.com/newsletter" />);
    expect(screen.getByRole("link", { name: /Join the list/ })).toHaveAttribute(
      "href",
      "https://example.com/newsletter",
    );
    expect(screen.getByRole("link", { name: /Join the list/ })).toHaveAttribute(
      "rel",
      "noopener noreferrer",
    );
  });

  it("rejects insecure, credential-bearing and script URLs", () => {
    for (const url of [
      undefined,
      "",
      "javascript:alert(1)",
      "http://example.com",
      "https://user:pass@example.com",
      "/subscribe",
    ])
      expect(newsletterSignupUrl(url)).toBeNull();
  });
});
