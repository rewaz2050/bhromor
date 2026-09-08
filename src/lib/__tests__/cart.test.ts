import { describe, expect, it } from "vitest";
import {
  MAX_LINE_QTY,
  addLine,
  defaultVariant,
  removeLine,
  resolveProduct,
  setQty,
  summarize,
  type CartLine,
} from "@/lib/cart";

const panjabi = resolveProduct("p1");
const gamcha = resolveProduct("p7");

describe("cart helpers", () => {
  it("adds a new line and merges an identical variant", () => {
    let lines: CartLine[] = [];
    lines = addLine(lines, "p1", "Forest Green · L", 1);
    lines = addLine(lines, "p1", "Forest Green · L", 2);
    expect(lines).toHaveLength(1);
    expect(lines[0].qty).toBe(3);
  });

  it("keeps different variants separate", () => {
    let lines: CartLine[] = [];
    lines = addLine(lines, "p1", "Forest Green · M", 1);
    lines = addLine(lines, "p1", "Forest Green · L", 1);
    expect(lines).toHaveLength(2);
  });

  it("setQty removes a line when quantity hits zero", () => {
    let lines = addLine([], "p1", "Forest Green · L", 2);
    lines = setQty(lines, "p1", "Forest Green · L", 0);
    expect(lines).toHaveLength(0);
  });

  it("removeLine deletes exactly the requested variant", () => {
    let lines = addLine([], "p1", "Forest Green · L", 1);
    lines = addLine(lines, "p7", "Red & Cream", 1);
    lines = removeLine(lines, "p1", "Forest Green · L");
    expect(lines).toHaveLength(1);
    expect(lines[0].productId).toBe("p7");
  });

  it("summarizes subtotal and item count without float drift", () => {
    let lines: CartLine[] = [];
    lines = addLine(lines, "p1", "Forest Green · L", 2); // 2 × 149000
    lines = addLine(lines, "p7", "Red & Cream", 1); // 1 × 35000
    const summary = summarize(lines);
    expect(summary.itemCount).toBe(3);
    expect(summary.subtotal).toBe(333000);
    expect(summary.lines[0].lineTotal).toBe(298000);
  });

  it("derives a sensible default variant", () => {
    expect(panjabi && defaultVariant(panjabi)).toBe("Forest Green · M");
    expect(gamcha && defaultVariant(gamcha)).toBe("Red & Cream");
  });
});

describe("quantity limits & corrupt storage", () => {
  it("caps a line at MAX_LINE_QTY however it is reached", () => {
    let lines = addLine([], "p1", "Forest Green · L", 8);
    lines = addLine(lines, "p1", "Forest Green · L", 8);
    expect(lines[0].qty).toBe(MAX_LINE_QTY);
    expect(setQty(lines, "p1", "Forest Green · L", 99)[0].qty).toBe(MAX_LINE_QTY);
  });

  it("ignores malformed lines from localStorage instead of crashing", () => {
    const junk = [
      { productId: "p1", variantLabel: "Forest Green · L", qty: 2 },
      { productId: "p1", variantLabel: "Forest Green · L", qty: Number.NaN },
      null,
    ] as never as Parameters<typeof summarize>[0];
    const summary = summarize(junk);
    expect(summary.itemCount).toBe(2);
    expect(Number.isFinite(summary.subtotal)).toBe(true);
  });
});
