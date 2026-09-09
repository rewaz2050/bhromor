import { describe, expect, it } from "vitest";
import {
  DEMO_ADMIN,
  DEMO_BLOCKED_IN_LIVE,
  isDemoAdminAttempt,
  mapSupabaseAuthError,
  staffProbeError,
} from "../admin-auth";

describe("staff login copy", () => {
  it("recognises the demo credentials even with extra case/space", () => {
    expect(isDemoAdminAttempt(DEMO_ADMIN.email, DEMO_ADMIN.password)).toBe(true);
    expect(
      isDemoAdminAttempt(`  ${DEMO_ADMIN.email.toUpperCase()}  `, DEMO_ADMIN.password),
    ).toBe(true);
    expect(isDemoAdminAttempt("other@prosanti.store", DEMO_ADMIN.password)).toBe(
      false,
    );
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
    expect(DEMO_BLOCKED_IN_LIVE).toMatch(/Demo login is off/);
  });
});
