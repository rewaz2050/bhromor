import { describe, expect, it } from "vitest";
import type { Rider } from "@/lib/catalog";
import {
  getRidersServer,
  seedRiders,
  upsertRiderInList,
} from "@/lib/riders-store";

describe("rider demo store (slice 6)", () => {
  it("seeds an application plus an approved rider", () => {
    const seeded = seedRiders();
    expect(seeded.map((r) => r.status)).toEqual(["pending", "active"]);
    expect(seeded.every((r) => r.cashInHand === 0)).toBe(true);
    expect(getRidersServer()).toBe(getRidersServer());
  });

  it("inserts and updates without mutating the incoming list", () => {
    const seeded = seedRiders();
    const replacement: Rider = {
      ...seeded[0],
      name: "Verified Rider",
      zoneIds: [...seeded[0].zoneIds, "zone-test"],
    };
    const updated = upsertRiderInList(seeded, replacement);

    expect(updated).not.toBe(seeded);
    expect(updated[0].name).toBe("Verified Rider");
    expect(updated[0].zoneIds).not.toBe(replacement.zoneIds);
    expect(seeded[0].name).not.toBe("Verified Rider");
    expect(seeded[0].zoneIds).not.toContain("zone-test");

    const created: Rider = {
      ...seeded[0],
      id: "rider-demo-new",
      name: "New Rider",
    };
    expect(upsertRiderInList(seeded, created)).toHaveLength(
      seeded.length + 1,
    );
  });
});
