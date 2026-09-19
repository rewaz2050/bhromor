import { describe, expect, it } from "vitest";
import {
  publishBlocker,
  shelfActions,
  shelfCounts,
  shelfState,
  type ShelfProduct,
} from "../product-shelf";

const base: ShelfProduct & { name: string } = {
  name: "Jamdani",
  status: "published",
  active: true,
  inStock: true,
  stock: 12,
  media: [{ src: "/images/a.jpg" }],
  price: 250000,
};

describe("shelfState", () => {
  it("answers the buyer's question, not the row's flags", () => {
    expect(shelfState(base)).toBe("live");
    expect(shelfState({ ...base, stock: 3 })).toBe("low");
    expect(shelfState({ ...base, lowStock: true })).toBe("low");
    expect(shelfState({ ...base, stock: 0 })).toBe("out");
    expect(shelfState({ ...base, inStock: false, stock: undefined })).toBe("out");
    expect(shelfState({ ...base, status: "draft" })).toBe("draft");
    // Archived wins over everything; a draft wins over stock.
    expect(shelfState({ ...base, active: false, stock: 0 })).toBe("archived");
    expect(shelfState({ ...base, status: "draft", stock: 0 })).toBe("draft");
  });

  it("treats a legacy row without a stock count as live when in_stock is true", () => {
    expect(shelfState({ ...base, stock: undefined })).toBe("live");
  });
});

describe("shelfCounts", () => {
  it("counts every state once and `all` as the total", () => {
    const counts = shelfCounts([
      base,
      { ...base, stock: 2 },
      { ...base, stock: 0 },
      { ...base, status: "draft" },
      { ...base, active: false },
    ]);
    expect(counts).toEqual({ all: 5, live: 1, low: 1, out: 1, draft: 1, archived: 1 });
  });
});

describe("publishBlocker", () => {
  it("refuses a broken card before the tap", () => {
    expect(publishBlocker(base)).toBeNull();
    expect(publishBlocker({ ...base, media: [] })).toMatch(/photo/i);
    expect(publishBlocker({ ...base, price: 0 })).toMatch(/price/i);
  });
});

describe("shelfActions", () => {
  it("offers Restore for archived, Publish + Archive for drafts, Unpublish + Archive for live rows", () => {
    expect(shelfActions({ ...base, active: false }).map((a) => a.label)).toEqual(["Restore"]);
    expect(shelfActions({ ...base, status: "draft" }).map((a) => a.label)).toEqual(["Publish", "Archive"]);
    expect(shelfActions(base).map((a) => a.label)).toEqual(["Unpublish", "Archive"]);
    expect(shelfActions({ ...base, stock: 0 }).map((a) => a.label)).toEqual(["Unpublish", "Archive"]);
  });

  it("sends one-field PATCH bodies and confirms only the destructive one", () => {
    const [publish, archive] = shelfActions({ ...base, status: "draft" });
    expect(publish.patch).toEqual({ status: "published" });
    expect(publish.confirm).toBeUndefined();
    expect(archive.patch).toEqual({ active: false });
    expect(archive.confirm).toContain("Jamdani");
    expect(shelfActions({ ...base, active: false })[0].patch).toEqual({ active: true });
  });
});
