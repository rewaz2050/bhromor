import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import StorefrontSkeleton from "../storefront-skeleton";
afterEach(cleanup);
it("announces a single loading status without fake interactive content", () => {
  const { rerender } = render(<StorefrontSkeleton />);
  expect(
    screen.getByRole("status", { name: "Loading collection" }),
  ).toBeInTheDocument();
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
  rerender(<StorefrontSkeleton product />);
  expect(
    screen.getByRole("status", { name: "Loading product" }),
  ).toBeInTheDocument();
});
