import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import GalleryLightbox from "@/components/product/gallery-lightbox";

/**
 * jsdom ships no PointerEvent, so testing-library would dispatch a plain
 * Event and every gesture would arrive with undefined coordinates. The
 * component is pointer-driven, so the test brings the missing class:
 * a MouseEvent (which already carries clientX/Y) plus pointerId.
 */
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

const IMAGES = [
  { key: "img-0", src: "/images/products/panjabi.jpg", alt: "Cover photo" },
  { key: "img-1", src: "/images/products/panjabi-2.jpg", alt: "Weave close-up" },
  { key: "img-2", src: "/images/products/panjabi-3.jpg", alt: "Back view" },
];

const open = (index = 0) => {
  const onIndexChange = vi.fn();
  const onClose = vi.fn();
  render(
    <GalleryLightbox
      images={IMAGES}
      index={index}
      onIndexChange={onIndexChange}
      onClose={onClose}
      title="Heritage Green Panjabi"
    />,
  );
  return { onIndexChange, onClose };
};

describe("GalleryLightbox", () => {
  it("opens as a modal dialog with the caption, counter and every photo", () => {
    open(1);
    expect(screen.getByRole("dialog")).toHaveAttribute("aria-modal", "true");
    expect(screen.getByText("Weave close-up")).toBeInTheDocument();
    expect(screen.getByText("2 / 3")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /show photo/i })).toHaveLength(
      3,
    );
  });

  it("steps through the photos with the arrow buttons", () => {
    const { onIndexChange } = open(0);
    fireEvent.click(screen.getByRole("button", { name: "Next photo" }));
    expect(onIndexChange).toHaveBeenCalledWith(1);
    fireEvent.click(screen.getByRole("button", { name: "Previous photo" }));
    // Wraps backwards from the first photo to the last.
    expect(onIndexChange).toHaveBeenCalledWith(2);
  });

  it("wraps forward from the last photo", () => {
    const { onIndexChange } = open(2);
    fireEvent.click(screen.getByRole("button", { name: "Next photo" }));
    expect(onIndexChange).toHaveBeenCalledWith(0);
  });

  it("closes on Escape and on the ✕", () => {
    const { onClose } = open(0);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Close viewer" }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("moves with the keyboard arrows", () => {
    const { onIndexChange } = open(0);
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(onIndexChange).toHaveBeenCalledWith(1);
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(onIndexChange).toHaveBeenCalledWith(2);
  });

  it("jumps straight to a photo from the filmstrip", () => {
    const { onIndexChange } = open(0);
    fireEvent.click(screen.getByRole("button", { name: "Show photo 3" }));
    expect(onIndexChange).toHaveBeenCalledWith(2);
  });

  it("zooms on double-tap and returns to 1× on reset", () => {
    open(0);
    const stage = screen.getByTestId("gallery-lightbox").querySelector(
      "[data-zoom]",
    ) as HTMLElement;
    expect(stage).toHaveAttribute("data-zoom", "out");

    const tap = () =>
      fireEvent.pointerUp(stage, {
        pointerId: 1,
        clientX: 120,
        clientY: 200,
      });
    fireEvent.pointerDown(stage, { pointerId: 1, clientX: 120, clientY: 200 });
    tap();
    fireEvent.pointerDown(stage, { pointerId: 1, clientX: 120, clientY: 200 });
    tap();
    expect(stage).toHaveAttribute("data-zoom", "in");

    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(stage).toHaveAttribute("data-zoom", "out");
  });

  it("locks the page scroll while it is open", () => {
    open(0);
    expect(document.body.style.overflow).toBe("hidden");
    cleanup();
    expect(document.body.style.overflow).not.toBe("hidden");
  });
});
