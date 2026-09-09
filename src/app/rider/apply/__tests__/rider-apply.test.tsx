import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import RiderApplyPage from "../page";

describe("Rider Apply Page", () => {
  it("renders rider application form fields", () => {
    render(<RiderApplyPage />);

    expect(screen.getByText(/রাইডার হিসেবে যোগ দিন/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/যেমন: তানভীর আহমেদ/i)).toBeInTheDocument();
  });
});
