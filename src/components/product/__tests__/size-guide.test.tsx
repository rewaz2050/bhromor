import { afterEach, describe, expect, it } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import SizeGuide, { InlineSizeGuide } from "../size-guide";
import { PRODUCTS } from "@/lib/catalog";

afterEach(cleanup);
describe("Size guidance", () => {
  it("shows catalog fit without inventing a measurement chart and restores focus on Escape", async () => {
    render(<SizeGuide product={PRODUCTS[0]} />);
    const trigger = screen.getByRole("button", { name: "Size Guide" });
    trigger.focus();
    fireEvent.click(trigger);
    expect(
      screen.getByRole("dialog", { name: "Size and fit guide" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Regular · modesty cut")).toBeInTheDocument();
    expect(
      screen.getByText(
        /verified size-by-size measurement chart is not yet available/,
      ),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Close size guide" }),
      ).toHaveFocus(),
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(document.body.style.overflow).not.toBe("hidden");
  });
  it("keeps quick-add guidance inline and handles one-size products honestly", () => {
    render(
      <InlineSizeGuide
        product={PRODUCTS.find((p) => p.subCategory === "Gamcha")!}
      />,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText(/One size is a product label/)).toBeInTheDocument();
    expect(screen.getByText("45 × 90 in approx.")).toBeInTheDocument();
  });
});
