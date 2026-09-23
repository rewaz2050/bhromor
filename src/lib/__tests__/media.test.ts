import { describe, expect, it } from "vitest";
import { hasProductVideo } from "@/lib/media";

describe("hasProductVideo", () => {
  it("is true for a YouTube link or a hosted video, false for stills only", () => {
    expect(hasProductVideo({ media: [{ kind: "image" }] })).toBe(false);
    expect(hasProductVideo({ media: [{}] })).toBe(false);
    expect(hasProductVideo({ media: [{ kind: "image" }, { kind: "video" }] })).toBe(true);
    expect(hasProductVideo({ video: { youtubeId: "dQw4w9WgXcQ" }, media: [] })).toBe(true);
    expect(hasProductVideo({ video: null, media: [] })).toBe(false);
  });
});
