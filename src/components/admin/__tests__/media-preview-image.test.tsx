import { afterEach, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MediaPreviewImage } from "../media-preview-image";
afterEach(cleanup);
it("offers an explicit retry without changing the media source", () => {
  const { container } = render(<MediaPreviewImage src="https://example.test/photo.jpg" />);
  fireEvent.error(container.querySelector("img")!);
  fireEvent.click(screen.getByRole("button", { name: "Preview unavailable. Retry media preview" }));
  expect(container.querySelector("img")).toHaveAttribute("src", "https://example.test/photo.jpg");
});
it("does not carry a broken preview state into a replacement source", () => {
  const { container, rerender } = render(<MediaPreviewImage src="https://example.test/bad.jpg" />);
  fireEvent.error(container.querySelector("img")!);
  rerender(<MediaPreviewImage src="https://example.test/good.jpg" />);
  expect(container.querySelector("img")).toHaveAttribute("src", "https://example.test/good.jpg");
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});
