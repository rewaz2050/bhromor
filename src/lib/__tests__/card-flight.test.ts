import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  CARD_FLIGHT_KEY,
  boxOf,
  clearFlight,
  flightTransform,
  isFlightFresh,
  paintedSrcOf,
  readFlight,
  rememberFlight,
} from "@/lib/card-flight";

beforeEach(() => sessionStorage.clear());
afterEach(() => sessionStorage.clear());

const box = (left: number, top: number, width: number, height: number) => ({
  left,
  top,
  width,
  height,
});

describe("card flight geometry", () => {
  it("maps one box onto another as a translate + scale from the top-left", () => {
    const from = box(20, 40, 200, 250);
    const to = box(300, 90, 400, 500);
    expect(flightTransform(from, to)).toEqual({ dx: 280, dy: 50, scale: 2 });
  });

  it("is a no-op when the two boxes are the same", () => {
    const same = box(10, 10, 120, 150);
    expect(flightTransform(same, same)).toEqual({ dx: 0, dy: 0, scale: 1 });
  });

  it("never divides by a zero-width box", () => {
    expect(flightTransform(box(0, 0, 0, 0), box(0, 0, 100, 100)).scale).toBe(1);
  });

  it("reads a laid-out element and ignores a hidden one", () => {
    const element = document.createElement("div");
    document.body.appendChild(element);
    // jsdom reports every box as 0×0 unless it is stubbed.
    expect(boxOf(element)).toBeNull();
    element.getBoundingClientRect = () =>
      ({ left: 5, top: 6, width: 7, height: 8 }) as DOMRect;
    expect(boxOf(element)).toEqual(box(5, 6, 7, 8));
    element.remove();
    expect(boxOf(null)).toBeNull();
  });

  it("prefers the URL the browser already painted over the raw src", () => {
    const image = document.createElement("img");
    image.src = "/images/products/panjabi.jpg";
    document.body.appendChild(image);
    expect(paintedSrcOf(image)).toBe(image.src);
    Object.defineProperty(image, "currentSrc", {
      value: "/_next/image?url=%2Fimages%2Fproducts%2Fpanjabi.jpg&w=828",
    });
    expect(paintedSrcOf(image)).toContain("/_next/image");
    image.remove();
    expect(paintedSrcOf(null)).toBe("");
  });
});

describe("card flight freshness", () => {
  const flight = { src: "/a.jpg", box: box(0, 0, 10, 10), slug: "a", at: 1000 };

  it("accepts a record written moments ago", () => {
    expect(isFlightFresh(flight, 1500)).toBe(true);
  });

  it("rejects a record the shopper has clearly moved on from", () => {
    expect(isFlightFresh(flight, 1000 + 60_000)).toBe(false);
  });

  it("rejects a timestamp from a tab with a fast clock", () => {
    expect(isFlightFresh({ ...flight, at: 9000 }, 1000)).toBe(false);
  });
});

describe("card flight handoff", () => {
  it("round-trips through sessionStorage and clears on demand", () => {
    const flight = {
      src: "/_next/image?url=a.jpg&w=828",
      box: box(12, 34, 56, 78),
      slug: "heritage-green-panjabi",
      at: 4242,
    };
    rememberFlight(flight);
    expect(readFlight()).toEqual(flight);
    clearFlight();
    expect(readFlight()).toBeNull();
    expect(sessionStorage.getItem(CARD_FLIGHT_KEY)).toBeNull();
  });

  it("ignores missing, corrupt or incomplete records", () => {
    expect(readFlight()).toBeNull();
    sessionStorage.setItem(CARD_FLIGHT_KEY, "not json");
    expect(readFlight()).toBeNull();
    sessionStorage.setItem(CARD_FLIGHT_KEY, JSON.stringify({ src: "/a.jpg" }));
    expect(readFlight()).toBeNull();
    sessionStorage.setItem(
      CARD_FLIGHT_KEY,
      JSON.stringify({
        src: "/a.jpg",
        box: { left: "0", top: 0, width: 1, height: 1 },
        slug: "a",
        at: 1,
      }),
    );
    expect(readFlight()).toBeNull();
  });
});
