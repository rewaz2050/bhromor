import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { LoyaltyCard } from "../loyalty-card";

describe("LoyaltyCard — Smart Card (signed-out teaser)", () => {
  it("shows the join card: 10 stamps, free prize, account required, no verification", () => {
    render(<LoyaltyCard />);

    expect(screen.getByTestId("loyalty-stamp-card")).toBeInTheDocument();
    expect(screen.getByText(/১০টা স্ট্যাম্প পূর্ণ করলেই/)).toBeInTheDocument();
    expect(screen.getByText(/প্রতিটি অর্ডারে/)).toBeInTheDocument();
    expect(screen.getByText(/অ্যাকাউন্ট খুলতে হবে/)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /ফ্রি অ্যাকাউন্ট খুলুন/ }),
    ).toHaveAttribute("href", "/account");
  });
});
