import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import ProductGallery from "../product-gallery";
import { PRODUCTS } from "@/lib/catalog";

afterEach(cleanup);

const withMedia = () => ({
  ...PRODUCTS[0],
  media: [
    { src: "/images/products/panjabi.jpg", alt: "Cover photo" },
    {
      src: "https://res.cloudinary.com/demo/video/upload/v1/clip.mp4",
      alt: "Styling video",
      kind: "video" as const,
    },
    {
      src: "https://drive.google.com/file/d/1AbC2dEf3GhI4jKl5MnOp6QrS/preview",
      alt: "Drive clip",
      kind: "video" as const,
    },
  ],
  video: { youtubeId: "dQw4w9WgXcQ", label: "Watch product video" },
});

describe("ProductGallery mixed media", () => {
  it("counts image + video + drive + youtube slides", () => {
    render(<ProductGallery product={withMedia()} />);
    expect(screen.getByText("01 / 04")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /play video: watch product video/i }),
    ).toBeInTheDocument();
  });

  it("plays the cloudinary mp4 inline with native controls", () => {
    const { container } = render(<ProductGallery product={withMedia()} />);
    fireEvent.click(screen.getByRole("button", { name: /play video 2/i }));
    const video = container.querySelector("video[src*='res.cloudinary.com']");
    expect(video).not.toBeNull();
    expect(video).toHaveAttribute("controls");
  });

  it("loads the youtube iframe only after the facade is tapped", () => {
    const { container } = render(<ProductGallery product={withMedia()} />);
    expect(container.querySelector("iframe")).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: /play video: watch product video/i }),
    );
    // Thumbnail strip button + stage facade share the name; the stage
    // facade comes first in the DOM — tap it.
    const matches = screen.getAllByRole("button", {
      name: "Play video: Watch product video",
    });
    expect(matches).toHaveLength(2);
    fireEvent.click(matches[0]);
    const iframe = container.querySelector(
      "iframe[src*='youtube-nocookie.com']",
    );
    expect(iframe).not.toBeNull();
    expect(iframe?.getAttribute("src")).toContain("autoplay=1");
  });

  it("loads the drive player only after the facade is tapped", () => {
    const { container } = render(<ProductGallery product={withMedia()} />);
    fireEvent.click(screen.getByRole("button", { name: /play video 3/i }));
    expect(container.querySelector("iframe")).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Play video: Drive clip" }),
    );
    expect(
      container.querySelector("iframe[src*='drive.google.com']"),
    ).not.toBeNull();
  });
});
