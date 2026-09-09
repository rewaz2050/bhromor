import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import ShopApplyPage from "../page";

describe("Shop Apply Page", () => {
  it("renders shop application form fields", () => {
    render(<ShopApplyPage />);

    expect(screen.getByText(/দোকানদার হিসেবে যুক্ত হোন/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/যেমন: আরিয়ান ফ্যাশন/i)).toBeInTheDocument();
  });
});
