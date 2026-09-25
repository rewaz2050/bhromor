import { describe, expect, it } from "vitest";
import { optimizedMediaUrl } from "../media-url";

const CLOUD = "https://res.cloudinary.com/demo/image/upload/panjabi.jpg";
const VERSIONED = "https://res.cloudinary.com/demo/image/upload/v1720000000/panjabi.jpg";
const TRANSFORMED =
  "https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,w_600,c_limit/panjabi.jpg";

describe("optimizedMediaUrl", () => {
  it("injects format/quality/width transforms into bare Cloudinary URLs", () => {
    expect(optimizedMediaUrl(CLOUD, 600)).toBe(
      "https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,w_600,c_limit/panjabi.jpg",
    );
  });

  it("inserts transforms before a version segment", () => {
    expect(optimizedMediaUrl(VERSIONED, 400)).toBe(
      "https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,w_400,c_limit/v1720000000/panjabi.jpg",
    );
  });

  it("leaves already-transformed URLs alone", () => {
    expect(optimizedMediaUrl(TRANSFORMED, 200)).toBe(TRANSFORMED);
    expect(
      optimizedMediaUrl(
        "https://res.cloudinary.com/demo/image/upload/w_300/panjabi.jpg",
        200,
      ),
    ).toBe("https://res.cloudinary.com/demo/image/upload/w_300/panjabi.jpg");
  });

  it("passes non-Cloudinary sources through untouched", () => {
    expect(optimizedMediaUrl("https://i.ytimg.com/vi/x/hqdefault.jpg", 200)).toBe(
      "https://i.ytimg.com/vi/x/hqdefault.jpg",
    );
    expect(optimizedMediaUrl("https://drive.google/thumbnail?id=x", 200)).toBe(
      "https://drive.google/thumbnail?id=x",
    );
    expect(optimizedMediaUrl("data:image/jpeg;base64,AAAA", 200)).toBe(
      "data:image/jpeg;base64,AAAA",
    );
    expect(optimizedMediaUrl("/images/hero.jpg", 800)).toBe("/images/hero.jpg");
    expect(optimizedMediaUrl("", 800)).toBe("");
  });
});
