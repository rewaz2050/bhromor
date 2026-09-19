// @vitest-environment jsdom
/**
 * Ops batch I (2026-09-18): Publish / Unpublish / Archive / Restore straight
 * from a product row, with the publish blockers said before the tap.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ShelfRowActions from "../shelf-row-actions";

const product = (over: Record<string, unknown> = {}) => ({
  id: "p1",
  name: "Jamdani",
  status: "draft" as const,
  active: true,
  inStock: true,
  stock: 4,
  media: [{ src: "/images/a.jpg" }],
  price: 250000,
  ...over,
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ShelfRowActions", () => {
  it("publishes a draft with a one-field PATCH", async () => {
    const onPatch = vi.fn(async () => {});
    render(<ShelfRowActions product={product()} onPatch={onPatch} />);
    fireEvent.click(screen.getByRole("button", { name: "Publish Jamdani" }));
    await waitFor(() => expect(onPatch).toHaveBeenCalledWith("p1", { status: "published" }));
  });

  it("disables Publish and says why when the card would be broken", () => {
    const onPatch = vi.fn(async () => {});
    render(<ShelfRowActions product={product({ media: [] })} onPatch={onPatch} />);
    const publish = screen.getByRole("button", { name: "Publish Jamdani" });
    expect(publish).toBeDisabled();
    expect(screen.getByRole("note")).toHaveTextContent(/photo/i);
    fireEvent.click(publish);
    expect(onPatch).not.toHaveBeenCalled();
  });

  it("archive asks first and is skipped when refused", async () => {
    const onPatch = vi.fn(async () => {});
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<ShelfRowActions product={product({ status: "published" })} onPatch={onPatch} />);
    fireEvent.click(screen.getByRole("button", { name: "Archive Jamdani" }));
    expect(confirm).toHaveBeenCalled();
    expect(onPatch).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "Archive Jamdani" }));
    await waitFor(() => expect(onPatch).toHaveBeenCalledWith("p1", { active: false }));
  });

  it("an archived row offers only Restore", async () => {
    const onPatch = vi.fn(async () => {});
    render(<ShelfRowActions product={product({ active: false })} onPatch={onPatch} />);
    expect(screen.getAllByRole("button")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Restore Jamdani" }));
    await waitFor(() => expect(onPatch).toHaveBeenCalledWith("p1", { active: true }));
  });

  it("shows the API's refusal inline and re-enables the buttons", async () => {
    const onPatch = vi.fn(async () => {
      throw new Error("That slug is already in use.");
    });
    render(<ShelfRowActions product={product({ status: "published" })} onPatch={onPatch} />);
    fireEvent.click(screen.getByRole("button", { name: "Unpublish Jamdani" }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("That slug is already in use."),
    );
    expect(screen.getByRole("button", { name: "Unpublish Jamdani" })).not.toBeDisabled();
  });
});
