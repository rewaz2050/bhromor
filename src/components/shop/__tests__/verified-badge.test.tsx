/**
 * B5 (2026-09-28) — the badge as a shopper meets it.
 *
 * Two promises: it appears ONLY for a shop whose two documents were checked,
 * and a shop that simply has not been processed is described as "not checked
 * yet" — not branded untrustworthy, which would be a lie about our own queue.
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import VerifiedBadge from "@/components/shop/verified-badge";

afterEach(cleanup);

const NOW = Date.parse("2026-09-28T12:00:00Z");

describe("VerifiedBadge (B5)", () => {
  it("shows the badge, and says what it means, when both documents are checked", () => {
    render(<VerifiedBadge verification={{ nid: true, tradeLicence: true, verifiedAt: NOW }} />);
    const badge = screen.getByTestId("verify-badge");
    expect(badge).toHaveTextContent("Verified shop");
    expect(badge.getAttribute("title")).toMatch(/ID and trade licence checked/i);
  });

  it("refuses to show the badge on a single document", () => {
    render(<VerifiedBadge verification={{ nid: true, tradeLicence: false, verifiedAt: NOW }} />);
    expect(screen.queryByTestId("verify-badge")).toBeNull();
    expect(screen.getByTestId("verify-none")).toBeInTheDocument();
  });

  it("treats a shop with nothing recorded as not checked (never as verified)", () => {
    render(<VerifiedBadge verification={undefined} />);
    expect(screen.queryByTestId("verify-badge")).toBeNull();
    expect(screen.getByTestId("verify-none")).toBeInTheDocument();
  });

  it("describes an unchecked shop as not-yet-checked, never as suspect", () => {
    render(<VerifiedBadge verification={{ nid: false, tradeLicence: false }} />);
    const none = screen.getByTestId("verify-none");
    expect(none).toHaveTextContent("Not checked yet");
    expect(none.getAttribute("title")).toMatch(/not checked/i);
    expect(none.textContent?.toLowerCase() ?? "").not.toMatch(/unverified|suspicious/);
  });

  it("dates the check on the storefront header", () => {
    render(
      <VerifiedBadge
        variant="full"
        verification={{ nid: true, tradeLicence: true, verifiedAt: NOW - 40 * 86_400_000 }}
      />,
    );
    const badge = screen.getByTestId("verify-badge");
    expect(badge).toHaveTextContent("Verified shop");
    expect(badge).toHaveTextContent("month");
  });
});
