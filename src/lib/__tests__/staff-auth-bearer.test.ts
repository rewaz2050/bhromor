import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { readBearerToken } from "../staff-auth";

describe("readBearerToken", () => {
  it("reads a Bearer token and rejects empty/non-bearer values", () => {
    expect(readBearerToken("Bearer abc.def.ghi")).toBe("abc.def.ghi");
    expect(readBearerToken("bearer abc.def.ghi")).toBe("abc.def.ghi");
    expect(readBearerToken("Basic nope")).toBeNull();
    expect(readBearerToken("Bearer ")).toBeNull();
    expect(readBearerToken(null)).toBeNull();
  });
});
