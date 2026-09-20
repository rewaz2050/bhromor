import { describe, expect, it } from "vitest";
import {
  facebookShareLink,
  shareText,
  shareUrl,
  whatsAppShareLink,
} from "@/lib/share";
import { PRODUCTS } from "@/lib/catalog";

const product = PRODUCTS[0];

describe("share links", () => {
  it("tags the page URL with the channel and drops any hash", () => {
    const u = new URL(shareUrl("https://prosanti.store/product/x#gallery", "whatsapp"));
    expect(u.hash).toBe("");
    expect(u.searchParams.get("utm_source")).toBe("whatsapp");
    expect(u.searchParams.get("utm_medium")).toBe("share");
    // A relative/odd string never throws — it is returned untouched.
    expect(shareUrl("not a url", "copy")).toBe("not a url");
  });

  it("writes the price into the text, Bangla-first in Bangla", () => {
    const en = shareText({ ...product, nameBn: "হেরিটেজ" }, "en");
    expect(en).toContain(product.name);
    expect(en).toContain("PROSANTI");
    expect(en).toMatch(/৳/);
    const bn = shareText({ ...product, nameBn: "হেরিটেজ" }, "bn");
    expect(bn).toContain("হেরিটেজ");
    expect(bn).not.toContain(product.name);
    // No Bangla name → the English name is used even in Bangla.
    expect(shareText({ ...product, nameBn: undefined }, "bn")).toContain(product.name);
  });

  it("builds plain wa.me / facebook sharer URLs (no SDK, no phone)", () => {
    const wa = whatsAppShareLink("Have a look", "https://prosanti.store/p");
    expect(wa.startsWith("https://wa.me/?text=")).toBe(true);
    expect(decodeURIComponent(wa)).toContain("Have a look\nhttps://prosanti.store/p");
    expect(facebookShareLink("https://prosanti.store/p?a=1")).toBe(
      "https://www.facebook.com/sharer/sharer.php?u=https%3A%2F%2Fprosanti.store%2Fp%3Fa%3D1",
    );
  });
});
