import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { AdminInputError, canManageRole, shapeStaffInput } from "../admin";

describe("shapeStaffInput (admin control center)", () => {
  it("shapes a valid grant, lower-casing the email", () => {
    expect(
      shapeStaffInput({ email: "  Boss@Example.com ", role: "admin" }),
    ).toEqual({ email: "boss@example.com", role: "admin" });
  });

  it("rejects bad emails and bad roles", () => {
    const bad: unknown[] = [
      { email: "not-an-email", role: "manager" },
      { email: "a@b.com" },
      { role: "admin" },
      { email: "a@b.com", role: "owner" },
      { email: "a@b.com", role: "ADMIN" },
      null,
    ];
    for (const raw of bad) {
      try {
        shapeStaffInput(raw);
        expect.unreachable(`should reject ${JSON.stringify(raw)}`);
      } catch (err) {
        expect(err).toBeInstanceOf(AdminInputError);
      }
    }
  });
});

describe("canManageRole (admin control center)", () => {
  it("lets actors touch roles at or below their own rank", () => {
    expect(canManageRole("manager", "manager")).toBe(true);
    expect(canManageRole("manager", "admin")).toBe(false);
    expect(canManageRole("admin", "manager", "admin")).toBe(true);
    expect(canManageRole("admin", "super_admin")).toBe(false);
    expect(canManageRole("super_admin", "manager", "admin", "super_admin")).toBe(
      true,
    );
  });
});
