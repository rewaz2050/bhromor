import { describe, expect, it } from "vitest";
import {
  cloudinaryPoster,
  driveDirectImageUrl,
  drivePreviewUrl,
  driveThumbnailUrl,
  extractDriveFileId,
  extractYoutubeId,
  isCloudinaryUrl,
  isDrivePreviewUrl,
  isVideoSrc,
  normalizeMediaInput,
  youtubeEmbedUrl,
  youtubeThumbUrl,
} from "../media";

const DRIVE_ID = "1AbC2dEf3GhI4jKl5MnOp6QrS";

describe("extractYoutubeId", () => {
  it("parses watch, share, shorts, live and embed forms", () => {
    expect(extractYoutubeId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(
      "dQw4w9WgXcQ",
    );
    expect(
      extractYoutubeId("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10s"),
    ).toBe("dQw4w9WgXcQ");
    expect(extractYoutubeId("https://youtu.be/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(extractYoutubeId("https://www.youtube.com/shorts/dQw4w9WgXcQ")).toBe(
      "dQw4w9WgXcQ",
    );
    expect(extractYoutubeId("https://www.youtube.com/live/dQw4w9WgXcQ")).toBe(
      "dQw4w9WgXcQ",
    );
    expect(
      extractYoutubeId("https://www.youtube.com/embed/dQw4w9WgXcQ"),
    ).toBe("dQw4w9WgXcQ");
    expect(extractYoutubeId("dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });

  it("returns null for empty input", () => {
    expect(extractYoutubeId("   ")).toBeNull();
  });
});

describe("youtube helpers", () => {
  it("builds privacy-friendly embeds and thumbnails", () => {
    expect(youtubeEmbedUrl("dQw4w9WgXcQ")).toContain("youtube-nocookie.com");
    expect(youtubeEmbedUrl("dQw4w9WgXcQ", true)).toContain("autoplay=1");
    expect(youtubeThumbUrl("dQw4w9WgXcQ")).toBe(
      "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
    );
  });
});

describe("extractDriveFileId", () => {
  it("parses every common Drive share form", () => {
    expect(
      extractDriveFileId(
        `https://drive.google.com/file/d/${DRIVE_ID}/view?usp=sharing`,
      ),
    ).toBe(DRIVE_ID);
    expect(
      extractDriveFileId(`https://drive.google.com/file/d/${DRIVE_ID}/preview`),
    ).toBe(DRIVE_ID);
    expect(
      extractDriveFileId(`https://drive.google.com/open?id=${DRIVE_ID}`),
    ).toBe(DRIVE_ID);
    expect(
      extractDriveFileId(
        `https://drive.google.com/uc?id=${DRIVE_ID}&export=download`,
      ),
    ).toBe(DRIVE_ID);
    expect(
      extractDriveFileId(
        `https://drive.google.com/thumbnail?id=${DRIVE_ID}&sz=w1000`,
      ),
    ).toBe(DRIVE_ID);
    // Short host (no .com) that Drive sometimes produces.
    expect(
      extractDriveFileId(
        `https://drive.google/file/d/${DRIVE_ID}/view?usp=sharing`,
      ),
    ).toBe(DRIVE_ID);
  });

  it("returns null for non-Drive input", () => {
    expect(extractDriveFileId("https://example.com/photo.jpg")).toBeNull();
    expect(extractDriveFileId("")).toBeNull();
  });
});

describe("drive url builders", () => {
  it("builds direct image, thumbnail and preview urls", () => {
    expect(driveDirectImageUrl(DRIVE_ID)).toBe(
      `https://lh3.googleusercontent.com/d/${DRIVE_ID}=w1600`,
    );
    expect(driveThumbnailUrl(DRIVE_ID)).toBe(
      `https://drive.google.com/thumbnail?id=${DRIVE_ID}&sz=w1000`,
    );
    expect(drivePreviewUrl(DRIVE_ID)).toBe(
      `https://drive.google.com/file/d/${DRIVE_ID}/preview`,
    );
    expect(isDrivePreviewUrl(drivePreviewUrl(DRIVE_ID))).toBe(true);
    expect(isDrivePreviewUrl(driveDirectImageUrl(DRIVE_ID))).toBe(false);
  });
});

describe("isVideoSrc", () => {
  it("detects video extensions, cloudinary video delivery and drive previews", () => {
    expect(isVideoSrc("https://cdn.example.com/a.mp4")).toBe(true);
    expect(isVideoSrc("https://cdn.example.com/a.webm?x=1")).toBe(true);
    expect(
      isVideoSrc(
        "https://res.cloudinary.com/demo/video/upload/v1/prosanti/products/a.mp4",
      ),
    ).toBe(true);
    expect(isVideoSrc(drivePreviewUrl(DRIVE_ID))).toBe(true);
    expect(isVideoSrc("https://cdn.example.com/a.jpg")).toBe(false);
    expect(
      isVideoSrc(
        "https://res.cloudinary.com/demo/image/upload/v1/prosanti/products/a.jpg",
      ),
    ).toBe(false);
    expect(isVideoSrc("/images/products/panjabi.jpg")).toBe(false);
  });
});

describe("isCloudinaryUrl / cloudinaryPoster", () => {
  it("detects cloudinary hosts and derives video posters", () => {
    const video =
      "https://res.cloudinary.com/demo/video/upload/v1/prosanti/products/a.mp4";
    expect(isCloudinaryUrl(video)).toBe(true);
    expect(isCloudinaryUrl("https://cdn.example.com/a.mp4")).toBe(false);
    expect(cloudinaryPoster(video)).toBe(
      "https://res.cloudinary.com/demo/video/upload/so_auto/v1/prosanti/products/a.jpg",
    );
    expect(cloudinaryPoster("https://cdn.example.com/a.mp4")).toBeNull();
  });
});

describe("normalizeMediaInput", () => {
  it("rejects empty and non-link input", () => {
    expect(normalizeMediaInput("   ").ok).toBe(false);
    expect(normalizeMediaInput("not a link!!").ok).toBe(false);
  });

  it("converts drive share links to direct images by default", () => {
    const r = normalizeMediaInput(
      `https://drive.google.com/file/d/${DRIVE_ID}/view?usp=sharing`,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.media.kind).toBe("image");
    expect(r.media.provider).toBe("drive");
    expect(r.media.src).toBe(driveDirectImageUrl(DRIVE_ID));
    expect(r.media.fileId).toBe(DRIVE_ID);
  });

  it("converts drive share links to preview embeds for videos", () => {
    const r = normalizeMediaInput(
      `https://drive.google.com/file/d/${DRIVE_ID}/view?usp=sharing`,
      { driveKind: "video" },
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.media.kind).toBe("video");
    expect(r.media.src).toBe(drivePreviewUrl(DRIVE_ID));
    expect(r.media.thumb).toBe(driveThumbnailUrl(DRIVE_ID));
  });

  it("routes youtube links to the youtube kind", () => {
    const r = normalizeMediaInput("https://youtu.be/dQw4w9WgXcQ");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.media.kind).toBe("youtube");
    expect(r.media.fileId).toBe("dQw4w9WgXcQ");
    expect(r.media.thumb).toBe(youtubeThumbUrl("dQw4w9WgXcQ"));
  });

  it("detects cloudinary videos and images", () => {
    const v = normalizeMediaInput(
      "https://res.cloudinary.com/demo/video/upload/v1/prosanti/products/a.mp4",
    );
    expect(v.ok && v.media.kind).toBe("video");
    const i = normalizeMediaInput(
      "https://res.cloudinary.com/demo/image/upload/v1/prosanti/products/a.jpg",
    );
    expect(i.ok && i.media.kind).toBe("image");
    if (i.ok) expect(i.media.provider).toBe("cloudinary");
  });

  it("keeps local paths and direct links as images", () => {
    const local = normalizeMediaInput("/images/products/panjabi.jpg");
    expect(local.ok && local.media.kind).toBe("image");
    if (local.ok) expect(local.media.provider).toBe("local");
    const direct = normalizeMediaInput("https://cdn.example.com/clip.mp4");
    expect(direct.ok && direct.media.kind).toBe("video");
  });
});
