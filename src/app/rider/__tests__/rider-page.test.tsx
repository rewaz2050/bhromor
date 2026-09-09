import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import RiderPage from "../page";

describe("Rider Mobile Portal (/rider)", () => {
  it("renders rider header, online toggle, cash meter, and task sections", () => {
    render(<RiderPage />);

    expect(screen.getByText(/PROSANTI রাইডার/i)).toBeInTheDocument();
    expect(screen.getByText(/হাতে জমা ক্যাশ/i)).toBeInTheDocument();
    expect(screen.getByText(/অ্যাসাইন্ড অর্ডার সমূহ/i)).toBeInTheDocument();
  });
});
