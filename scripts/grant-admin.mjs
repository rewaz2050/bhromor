/**
 * Grant one Supabase Auth user a staff role.
 *
 * The target must already exist in Supabase Authentication; this script does
 * not create users, reset passwords, or change email-verification state. It
 * finds the Auth user by email and upserts exactly one admin_users row.
 *
 * Usage:
 *   node scripts/grant-admin.mjs user@example.com --role admin
 *   node scripts/grant-admin.mjs user@example.com --role manager --dry-run
 *
 * Required env: NEXT_PUBLIC_SUPABASE_URL (https) + SUPABASE_SERVICE_ROLE_KEY.
 * Values may come from the process environment or local .env.local. They
 * are never printed, committed, or sent anywhere except the configured
 * Supabase project.
 */

import { existsSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const ROLES = ["manager", "admin", "super_admin"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERS_PER_PAGE = 200;
const MAX_USER_PAGES = 10;

const usage = () => {
  console.log(`Grant one existing Supabase Auth user a staff role.

Usage:
  node scripts/grant-admin.mjs user@example.com --role admin
  npm run grant-admin -- user@example.com --role admin

Options:
  --role <manager|admin|super_admin>  Staff role to grant (default: admin)
  --dry-run                           Validate input without changing anything
  --help                              Show this message`);
};

const fail = (message) => {
  console.error(`✕ ${message}`);
  process.exit(1);
};

const loadLocalEnv = () => {
  const path = new URL("../.env.local", import.meta.url);
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
};

const parseArgs = (argv) => {
  let email = "";
  let role = "admin";
  let dryRun = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      usage();
      process.exit(0);
    } else if (arg === "--dry-run") {
      dryRun = true;
    } else if (arg === "--role" || arg.startsWith("--role=")) {
      const value =
        arg === "--role" ? (argv[i + 1] ?? "") : arg.slice("--role=".length);
      if (arg === "--role") i += 1;
      role = value.trim().toLowerCase();
    } else if (arg.startsWith("--")) {
      fail(`Unknown option: ${arg}`);
    } else if (email === "") {
      email = arg.trim().toLowerCase();
    } else {
      fail("Expected exactly one email address.");
    }
  }
  if (email === "") fail("Missing email address. See --help.");
  if (!EMAIL_RE.test(email)) fail("Enter a valid email address.");
  if (!ROLES.includes(role)) {
    fail("Role must be one of: manager, admin, super_admin.");
  }
  return { email, role, dryRun };
};

const { email, role, dryRun } = parseArgs(process.argv.slice(2));
loadLocalEnv();

const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();

if (dryRun) {
  console.log(`Dry run — would grant ${role} to ${email}.`);
  console.log(
    `Project URL: ${url.startsWith("https://") ? "configured" : "missing/invalid"}.`,
  );
  console.log(`Service key: ${serviceKey === "" ? "missing" : "configured"}.`);
  console.log("No users were listed and no database rows were changed.");
  process.exit(0);
}

if (!url.startsWith("https://")) {
  fail("NEXT_PUBLIC_SUPABASE_URL must be an https URL.");
}
if (serviceKey === "") {
  fail("SUPABASE_SERVICE_ROLE_KEY is missing (see docs/backend.md).");
}

const db = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const findAuthUserByEmail = async () => {
  for (let page = 1; page <= MAX_USER_PAGES; page += 1) {
    const { data, error } = await db.auth.admin.listUsers({
      page,
      perPage: USERS_PER_PAGE,
    });
    if (error) fail(`Auth user lookup failed: ${error.message}`);
    const match = (data?.users ?? []).find(
      (user) => (user.email ?? "").toLowerCase() === email,
    );
    if (match) return match;
    if ((data?.users ?? []).length < USERS_PER_PAGE) return null;
  }
  return null;
};

const user = await findAuthUserByEmail();
if (!user) {
  fail(
    `No Supabase Auth user found for ${email}. Create/confirm that Auth user first, then rerun this command.`,
  );
}

const { error: grantError } = await db
  .from("admin_users")
  .upsert({ id: user.id, role }, { onConflict: "id" });
if (grantError) {
  if (grantError.code === "42P01") {
    fail("admin_users is missing. Apply supabase/schema.sql first.");
  }
  if (grantError.code === "23503") {
    fail("Auth user lookup is stale. Rerun the command.");
  }
  fail(`Staff grant failed: ${grantError.message}`);
}

const { data: row, error: readError } = await db
  .from("admin_users")
  .select("id,role")
  .eq("id", user.id)
  .single();
if (readError || !row || row.role !== role) {
  fail("Grant verification failed. Check admin_users for this user.");
}

console.log(`✓ ${email} is now ${role}.`);
if (!user.email_confirmed_at) {
  console.warn(
    "! The Auth email is unconfirmed. Confirm it in Supabase Authentication before staff sign-in.",
  );
}
