import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { LoyaltyCard } from "../loyalty-card";

describe("LoyaltyCard Component", () => {
  it("renders the 10-stamp loyalty card", () => {
    render(<LoyaltyCard />);

    expect(screen.getByTestId("loyalty-stamp-card")).toBeInTheDocument();
    expect(
      screen.getByText(/১০-অর্ডার লয়্যালটি স্ট্যাম্প কার্ড|অভিনন্দন/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });
});
