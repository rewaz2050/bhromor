/**
 * Applicant login accounts (apply = sign up, 2026-09-26).
 *
 * The application creates the login with the service role, email
 * pre-confirmed. An email that already has a login is reused only when the
 * applicant proves the password; otherwise the application is refused with
 * a 409 instead of silently minting a second identity.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("../../supabase-server", () => ({
  getSupabaseAnon: () => null,
}));

import {
  ApplicantAccountError,
  assertApplicantPassword,
  createApplicantAccount,
  deleteApplicantAccount,
  linksSession,
} from "../applicant-account";

const serviceWith = (createUser: (...args: unknown[]) => unknown) =>
  ({
    auth: { admin: { createUser: vi.fn(createUser), deleteUser: vi.fn(async () => ({ error: null })) } },
  }) as never;

const anonWith = (signIn: (...args: unknown[]) => unknown) =>
  ({
    auth: { signInWithPassword: vi.fn(signIn), signOut: vi.fn(async () => ({ error: null })) },
  }) as never;

describe("linksSession", () => {
  it("links a session only without a password or when its email is the application's", () => {
    expect(linksSession({}, "a@b.co")).toBe(false);
    expect(linksSession({ applicantUserId: "u1" }, "a@b.co")).toBe(true);
    expect(
      linksSession({ applicantUserId: "u1", applicantEmail: " A@b.co ", password: "secret1" }, "a@b.co"),
    ).toBe(true);
    expect(
      linksSession({ applicantUserId: "u1", applicantEmail: "staff@x.co", password: "secret1" }, "a@b.co"),
    ).toBe(false);
    expect(linksSession({ applicantUserId: "u1", applicantEmail: null, password: "secret1" }, "a@b.co")).toBe(
      false,
    );
  });
});

describe("assertApplicantPassword", () => {
  it("returns the password when it is long enough", () => {
    expect(assertApplicantPassword("secret1")).toBe("secret1");
  });

  it("throws a 400 for a missing or short password", () => {
    expect(() => assertApplicantPassword(undefined)).toThrow(ApplicantAccountError);
    try {
      assertApplicantPassword("abc");
    } catch (err) {
      expect((err as ApplicantAccountError).status).toBe(400);
      expect((err as ApplicantAccountError).message).toMatch(/at least 6/);
    }
  });

  it("throws for a password above the bcrypt ceiling", () => {
    expect(() => assertApplicantPassword("x".repeat(73))).toThrow(/72/);
  });
});

describe("createApplicantAccount", () => {
  it("creates a confirmed login with the applicant's name and kind", async () => {
    const service = serviceWith(async () => ({ data: { user: { id: "u-new" } }, error: null }));
    const result = await createApplicantAccount(
      service,
      { email: " Shop@Example.com ", password: "secret1", name: "Arian Fashion", kind: "vendor" },
      null,
    );
    expect(result).toEqual({ userId: "u-new", created: true });
    const call = (service as { auth: { admin: { createUser: ReturnType<typeof vi.fn> } } }).auth.admin
      .createUser.mock.calls[0][0] as Record<string, unknown>;
    expect(call.email).toBe("shop@example.com");
    expect(call.password).toBe("secret1");
    expect(call.email_confirm).toBe(true);
    expect(call.user_metadata).toEqual({ full_name: "Arian Fashion", applied_as: "vendor" });
  });

  it("reuses an existing login when the given password matches it", async () => {
    const service = serviceWith(async () => ({
      data: { user: null },
      error: { code: "email_exists", message: "A user with this email address has already been registered" },
    }));
    const anon = anonWith(async () => ({ data: { user: { id: "u-old" } }, error: null }));
    const result = await createApplicantAccount(
      service,
      { email: "rider@example.com", password: "secret1", name: "Tanvir", kind: "rider" },
      anon,
    );
    expect(result).toEqual({ userId: "u-old", created: false });
    expect(
      (anon as { auth: { signOut: ReturnType<typeof vi.fn> } }).auth.signOut,
    ).toHaveBeenCalled();
  });

  it("answers 409 when the email is taken and the password does not match", async () => {
    const service = serviceWith(async () => ({
      data: { user: null },
      error: { message: "User already registered" },
    }));
    const anon = anonWith(async () => ({
      data: { user: null },
      error: { message: "Invalid login credentials" },
    }));
    await expect(
      createApplicantAccount(
        service,
        { email: "rider@example.com", password: "wrong-1", name: "Tanvir", kind: "rider" },
        anon,
      ),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("answers 409 for a taken email when no anon client can verify it", async () => {
    const service = serviceWith(async () => ({
      data: { user: null },
      error: { code: "email_exists", message: "already registered" },
    }));
    await expect(
      createApplicantAccount(
        service,
        { email: "rider@example.com", password: "secret1", name: "Tanvir", kind: "rider" },
        null,
      ),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("turns a weak-password refusal into a 400 with guidance", async () => {
    const service = serviceWith(async () => ({
      data: { user: null },
      error: { code: "weak_password", message: "Password should be at least 8 characters" },
    }));
    await expect(
      createApplicantAccount(
        service,
        { email: "a@b.co", password: "secret1", name: "A", kind: "vendor" },
        null,
      ),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("raises any other Auth failure as a plain error (503 upstream)", async () => {
    const service = serviceWith(async () => ({
      data: { user: null },
      error: { code: "unexpected_failure", message: "boom" },
    }));
    const attempt = createApplicantAccount(
      service,
      { email: "a@b.co", password: "secret1", name: "A", kind: "vendor" },
      null,
    );
    await expect(attempt).rejects.toThrow(/boom/);
    await expect(attempt).rejects.not.toBeInstanceOf(ApplicantAccountError);
  });

  it("never rejects the caller from a failed compensation delete", async () => {
    const service = {
      auth: {
        admin: {
          deleteUser: vi.fn(async () => {
            throw new Error("gone");
          }),
        },
      },
    } as never;
    await expect(deleteApplicantAccount(service, "u-1")).resolves.toBeUndefined();
  });
});
