import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import Newsletter, { newsletterSignupUrl } from "../newsletter";
afterEach(cleanup);
describe("Newsletter opt-in", () => {
  it("does not collect emails or claim success when no service is connected", () => {
    render(<Newsletter />);
    expect(
      screen.getByRole("button", { name: "Signup opening soon" }),
    ).toBeDisabled();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(
      screen.getByText(/not collecting email addresses/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Explore new arrivals/ }),
    ).toHaveAttribute("href", "/shop?filter=new");
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
