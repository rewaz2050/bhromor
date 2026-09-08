import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import CheckoutAssurance from "../checkout-assurance";
afterEach(cleanup);
it("opens policy information separately so checkout input is not discarded", () => {
  render(<CheckoutAssurance />);
  expect(
    screen.getByRole("region", { name: "Order with confidence" }),
  ).toBeInTheDocument();
  expect(screen.getAllByRole("link")).toHaveLength(4);
  for (const link of screen.getAllByRole("link")) {
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  }
});
