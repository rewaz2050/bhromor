import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import Home from "../page";

describe("Landing page", () => {
  it("renders the PROSANTI brand heading", () => {
    render(<Home />);

    const heading = screen.getByRole("heading", {
      level: 1,
      name: "PROSANTI",
    });

    expect(heading).toBeInTheDocument();
  });

  it("shows a storefront status message", () => {
    render(<Home />);

    expect(screen.getByText(/storefront is under construction/i)).toBeInTheDocument();
  });
});
