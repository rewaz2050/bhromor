import { describe, expect, it } from "vitest";
import {
  ADMIN_EMAIL,
  mapSupabaseAuthError,
  staffProbeError,
} from "../admin-auth";

describe("staff login copy", () => {
  it("pins the single wired admin email", () => {
    expect(ADMIN_EMAIL).toBe("rahatbd2050@gmail.com");
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
