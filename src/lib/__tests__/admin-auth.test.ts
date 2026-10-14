import { describe, expect, it } from "vitest";
import {
  ADMIN_LOGIN_PATH,
  mapSupabaseAuthError,
  staffProbeError,
} from "../admin-auth";

describe("staff login copy", () => {
  it("keeps the admin gate path out of the storefront conceptually (M4)", () => {
    // The email prefill is gone entirely; only the obscurity-layer path
    // remains, and admin-api loads this module lazily (never in visitor bundles).
    expect(ADMIN_LOGIN_PATH).toMatch(/^\/admin\//);
  });

  it("explains unconfirmed email instead of a generic password error", () => {
    expect(mapSupabaseAuthError("Email not confirmed")).toMatch(/not confirmed/i);
    expect(mapSupabaseAuthError("Invalid login credentials")).toBe(
      "Incorrect email or password.",
    );
    expect(mapSupabaseAuthError("Failed to fetch")).toMatch(/Could not reach Supabase/);
  });

  it("separates missing session from missing staff role", () => {
    expect(staffProbeError({ staff: false, status: 403 })).toMatch(/admin_users/);
    expect(staffProbeError({ staff: false, status: 401 })).toMatch(/session/);
  });
});
