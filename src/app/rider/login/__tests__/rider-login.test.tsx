import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import RiderLoginPage from "../page";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

describe("Rider Login Page (/rider/login)", () => {
  it("renders rider login portal elements", () => {
    render(<RiderLoginPage />);

    expect(screen.getByText(/PROSANTI রাইডার লগইন/i)).toBeInTheDocument();
  });
});
