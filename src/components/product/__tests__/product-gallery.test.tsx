import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { LanguageProvider } from "@/components/i18n/language-provider";
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

describe("ProductGallery zoom", () => {
  it("opens a pinch/wheel zoom lightbox from the photo and closes on Escape", () => {
    render(<ProductGallery product={withMedia()} />);
    expect(screen.queryByTestId("zoom-lightbox")).toBeNull();
    fireEvent.click(screen.getByTestId("gallery-zoom-trigger"));
    const box = screen.getByTestId("zoom-lightbox");
    expect(box).toHaveAttribute("data-scale", "1.00");
    // wheel up zooms in around the cursor; the +/- buttons step by 0.5
    fireEvent.wheel(screen.getByTestId("zoom-stage"), { deltaY: -100, clientX: 10, clientY: 10 });
    expect(Number(box.getAttribute("data-scale"))).toBeGreaterThan(1);
    fireEvent.click(screen.getByRole("button", { name: /zoom out/i }));
    fireEvent.click(screen.getByRole("button", { name: /zoom out/i }));
    expect(box).toHaveAttribute("data-scale", "1.00");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByTestId("zoom-lightbox")).toBeNull();
  });

  it("magnifies around the cursor on hover (desktop) and resets on leave", () => {
    render(<ProductGallery product={withMedia()} />);
    const trigger = screen.getByTestId("gallery-zoom-trigger");
    const img = trigger.querySelector("img") as HTMLImageElement;
    expect(img.style.transform).toBe("");
    fireEvent.mouseMove(trigger, { clientX: 0, clientY: 0 });
    expect(img.style.transform).toContain("scale(1.9)");
    fireEvent.mouseLeave(trigger);
    expect(img.style.transform).toBe("");
  });
});


describe("gallery modal accessibility", () => {
  it("keeps focus on the zoom control when scale changes and restores the opener", async () => {
    const { container } = render(<ProductGallery product={withMedia()} />);
    const trigger = screen.getByTestId("gallery-zoom-trigger");
    container.inert = false; // jsdom does not provide the browser default.
    trigger.focus();
    fireEvent.click(trigger);
    await waitFor(() => expect(screen.getByRole("button", { name: "Close zoom" })).toHaveFocus());
    const zoom = screen.getByRole("button", { name: "Zoom in" });
    zoom.focus(); fireEvent.click(zoom);
    expect(zoom).toHaveFocus();
    expect(container.inert).toBe(true);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(trigger).toHaveFocus();
    expect(container.inert).toBe(false);
  });
  it("bounds zoom, permits keyboard panning and resets the view", () => {
    render(<ProductGallery product={withMedia()} />);
    fireEvent.click(screen.getByTestId("gallery-zoom-trigger"));
    expect(screen.getByRole("button", { name: "Zoom out" })).toBeDisabled();
    for (let i = 0; i < 12; i++) fireEvent.keyDown(window, { key: "+" });
    expect(screen.getByTestId("zoom-lightbox")).toHaveAttribute("data-scale", "4.00");
    expect(screen.getByRole("button", { name: "Zoom in" })).toBeDisabled();
    fireEvent.keyDown(window, { key: "ArrowRight" });
    const photo = screen.getByTestId("zoom-stage").querySelector("img")!;
    expect(photo.style.transform).toContain("-40px");
    fireEvent.click(screen.getByRole("button", { name: "Reset zoom" }));
    expect(photo.style.transform).toContain("scale(1)");
    expect(photo.style.transform).not.toContain("-40px");
  });
  it("localizes gallery navigation and zoom controls without rewriting media descriptions", () => {
    render(<LanguageProvider initialLang="bn"><ProductGallery product={withMedia()} /></LanguageProvider>);
    expect(screen.getByText("০১ / ০৪")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ভিডিও 2 চালান" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "বড় ছবি দেখুন: Cover photo" }));
    expect(screen.getByRole("dialog", { name: "Cover photo" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ছবি বড় করুন" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "জুম আগের মতো করুন" })).toBeInTheDocument();
  });
});
