import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { LoyaltyCard } from "../loyalty-card";
import type { SmartCard } from "@/lib/use-smart-card";

const cardState = vi.hoisted(() => ({ card: null as SmartCard | null, signedIn: false }));
vi.mock("@/lib/use-smart-card", () => ({
  useSmartCard: () => ({ card: cardState.card, signedIn: cardState.signedIn, loading: false }),
}));
vi.mock("@/lib/use-customer", () => ({
  useCustomer: () => ({
    customer: cardState.signedIn ? { name: "Rahim", phone: "01711111111" } : null,
    loading: false,
    refresh: async () => undefined,
  }),
}));

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
    expect(screen.getByText(/রিভিউ প্রকাশিত হলেও ১টি/)).toBeInTheDocument();
  });

  it("signed in: counts review stamps next to the orders (R10 ledger)", () => {
    cardState.signedIn = true;
    cardState.card = {
      stamps: 3,
      orderCount: 2,
      reviewStamps: 1,
      target: 10,
      cycles: 0,
      unlocked: false,
      revealed: true,
      enabled: true,
      rewardTitle: "একটি গামছা ফ্রি",
      rewardDescription: "",
      afterOrderStamps: 4,
    };
    try {
      render(<LoyaltyCard />);
      expect(screen.getByText(/সর্বমোট অর্ডার: 2 টি/)).toHaveTextContent(/রিভিউ স্ট্যাম্প: 1/);
    } finally {
      cardState.signedIn = false;
      cardState.card = null;
    }
  });
});
