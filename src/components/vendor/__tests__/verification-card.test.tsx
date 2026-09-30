/**
 * B5 (2026-09-28) — the shop's view of its own badge.
 *
 * The badge is staff's to give, so the shop's screen must be honest without
 * being a dead end: it says exactly which document is missing and what to do —
 * and it never leaks the staff note or the officer's e-mail, which exist on the
 * admin side of the same feature.
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import VerificationCard from "@/components/vendor/verification-card";

afterEach(cleanup);

const NOW = Date.parse("2026-09-28T12:00:00Z");

describe("VerificationCard (B5)", () => {
  it("shows the badge and the date it was earned", () => {
    render(
      <VerificationCard
        shopName="Sitara Boutique"
        verification={{ nid: true, tradeLicence: true, verifiedAt: NOW }}
      />,
    );
    expect(screen.getByTestId("verification-state")).toHaveTextContent("Verified");
    expect(screen.getByTestId("verification-line")).toHaveTextContent("documents are checked");
    expect(screen.getByTestId("verification-since")).toHaveTextContent("Sitara Boutique");
  });

  it("names the document that is still missing, and what to do about it", () => {
    render(<VerificationCard shopName="Sitara" verification={{ nid: true, tradeLicence: false }} />);
    expect(screen.getByTestId("verification-state")).toHaveTextContent("Not yet verified");
    expect(screen.getByTestId("verification-check-tradeLicence")).toHaveTextContent("not checked yet");
    expect(screen.getByTestId("verification-check-nid")).toHaveTextContent("checked");
    expect(screen.getByTestId("verification-help")).toHaveTextContent("trade licence");
  });

  it("asks for both documents when neither has been seen", () => {
    render(<VerificationCard shopName="Sitara" verification={undefined} />);
    const help = screen.getByTestId("verification-help");
    expect(help).toHaveTextContent("National ID");
    expect(help).toHaveTextContent("trade licence");
    expect(screen.getByTestId("verification-line")).toHaveTextContent(
      "has not checked your documents yet",
    );
  });

  it("never leaks the staff note or the officer — those are not the shop's business", () => {
    render(
      <VerificationCard
        shopName="Sitara"
        verification={{ nid: true, tradeLicence: true, verifiedAt: NOW }}
      />,
    );
    // The component takes no audit prop at all: the leak is impossible by
    // construction, and the copy stays clean.
    expect(screen.getByTestId("verification-card").textContent ?? "").not.toMatch(
      /@prosanti|licence expired|staff/i,
    );
  });
});
