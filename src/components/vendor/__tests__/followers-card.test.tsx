/**
 * B1 (2026-09-28) — the shop's follower card. The call list is the whole
 * point: a follower whose phone has notifications off exists only here, so
 * the card must show the numbers (tappable) rather than a silent zero.
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import FollowersCard from "@/components/vendor/followers-card";

afterEach(cleanup);

const row = (phone: string, lastNotifiedAt: string | null) => ({
  phone,
  marketingOk: true,
  lastNotifiedAt,
  createdAt: "2026-09-27T06:00:00.000Z",
});

describe("FollowersCard (B1)", () => {
  it("says there are no followers yet instead of showing a bare 0", () => {
    render(<FollowersCard followers={0} neverReached={[]} />);
    expect(screen.getByTestId("followers-count")).toHaveTextContent("0");
    expect(screen.getByText(/no followers yet/i)).toBeVisible();
    expect(screen.queryByTestId("followers-call-list")).toBeNull();
  });

  it("lists every number the push never reached as a tappable call list", () => {
    render(
      <FollowersCard
        followers={3}
        neverReached={["01712345678", "01812345678"]}
        rows={[row("01712345678", null), row("01912345678", "2026-09-28T05:00:00.000Z")]}
      />,
    );
    expect(screen.getByTestId("followers-count")).toHaveTextContent("3");
    expect(screen.getByText(/3 shoppers are watching your shelf/i)).toBeVisible();

    const list = screen.getByTestId("followers-call-list");
    expect(list).toHaveTextContent("Call these numbers");
    expect(screen.getByRole("link", { name: "01712345678" })).toHaveAttribute(
      "href",
      "tel:01712345678",
    );
    expect(screen.getByRole("link", { name: "01812345678" })).toBeVisible();

    // The recent rows say which of them have already been told.
    const recent = screen.getByTestId("followers-recent");
    expect(recent).toHaveTextContent("not told yet");
    expect(recent).toHaveTextContent("told about a new piece");
  });

  it("hides the call list when everyone has been reached", () => {
    render(
      <FollowersCard
        followers={1}
        neverReached={[]}
        rows={[row("01712345678", "2026-09-28T05:00:00.000Z")]}
      />,
    );
    expect(screen.queryByTestId("followers-call-list")).toBeNull();
  });

  it("shows a loading line, not a fake count, while the read is in flight", () => {
    render(<FollowersCard followers={0} neverReached={[]} loading />);
    expect(screen.queryByTestId("followers-count")).toBeNull();
  });
});
