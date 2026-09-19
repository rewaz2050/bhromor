import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import ProductGallery from "../product-gallery";
import { PRODUCTS } from "@/lib/catalog";

/** jsdom has no PointerEvent — see gallery-lightbox.test.tsx. */
beforeAll(() => {
  class TestPointerEvent extends MouseEvent {
    pointerId: number;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 0;
    }
  }
  // @ts-expect-error — jsdom has no PointerEvent to assign to.
  window.PointerEvent = TestPointerEvent;
});

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

describe("ProductGallery zoom viewer", () => {
  const threePhotos = () => ({
    ...PRODUCTS[0],
    media: [
      { src: "/images/products/panjabi.jpg", alt: "Cover photo" },
      { src: "/images/products/panjabi-2.jpg", alt: "Weave close-up" },
      { src: "/images/products/panjabi-3.jpg", alt: "Back view" },
    ],
    video: undefined,
  });

  it("opens the fullscreen viewer from the photo, and only from the photo", () => {
    render(<ProductGallery product={withMedia()} />);
    // The cover is an image, so it offers the zoom stage…
    expect(screen.getByTestId("gallery-zoom-open")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("gallery-zoom-open"));
    expect(screen.getByTestId("gallery-lightbox")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close viewer" }));

    // …while a video slide keeps its own controls and offers no zoom.
    fireEvent.click(screen.getByRole("button", { name: /play video 2/i }));
    expect(screen.queryByTestId("gallery-zoom-open")).toBeNull();
  });

  it("keeps the gallery and the viewer on the same photo", () => {
    render(<ProductGallery product={threePhotos()} />);
    fireEvent.click(screen.getByTestId("gallery-zoom-open"));
    expect(screen.getByText("1 / 3")).toBeInTheDocument();
    // Stepping in the viewer moves the gallery underneath it.
    fireEvent.click(screen.getByRole("button", { name: "Next photo" }));
    expect(screen.getByText("2 / 3")).toBeInTheDocument();
    expect(screen.getByText("02 / 03")).toBeInTheDocument();
    // And closing it leaves the shopper on the photo they were looking at.
    fireEvent.click(screen.getByRole("button", { name: "Close viewer" }));
    expect(screen.queryByTestId("gallery-lightbox")).toBeNull();
    expect(screen.getByText("02 / 03")).toBeInTheDocument();
  });
});
