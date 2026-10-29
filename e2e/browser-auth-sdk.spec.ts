import { test, expect, type BrowserContext } from "@playwright/test";
import { createRequire } from "node:module";
import { resolve } from "node:path";

// Reuse the installed Vite toolchain's bundler. No CDN, test-only app route,
// copied SDK implementation or runtime dependency is introduced.
const viteRequire = createRequire(
  createRequire(resolve(process.cwd(), "package.json")).resolve(
    "vite/package.json",
  ),
);
const { buildSync } = viteRequire("esbuild");
const bundle: string = buildSync({
  stdin: {
    resolveDir: process.cwd(),
    contents: `
      import { getSupabaseBrowser } from './src/lib/supabase-browser';
      import { runBrowserAuthMutation } from './src/lib/rider-auth-lane';
      const client = getSupabaseBrowser();
      const events = [];
      client.auth.onAuthStateChange(event => { events.push(event); });
      window.sdkHarness = {
        events,
        ready: client.auth.getSession(),
        uid: async () => (await client.auth.getSession()).data.session?.user.id ?? null,
        login: async email => {
          const result = await runBrowserAuthMutation(client, () => true,
            () => client.auth.signInWithPassword({ email, password: 'fixture-password' }));
          return result.accepted ? { accepted: true, error: result.value.error?.message ?? null }
            : { accepted: false };
        },
        logout: async () => {
          const result = await runBrowserAuthMutation(client, () => true, () => client.auth.signOut(), true);
          return result.accepted ? { accepted: true, error: result.value.error?.message ?? null }
            : { accepted: false };
        },
        changePassword: async () => {
          const result = await runBrowserAuthMutation(client, () => true,
            () => client.auth.updateUser({ password: 'fixture-new-password' }));
          return result.accepted ? { accepted: true, error: result.value.error?.message ?? null } : { accepted: false };
        },
        refresh: async () => {
          const result = await client.auth.refreshSession();
          return { error: result.error?.message ?? null };
        },
      };
    `,
    loader: "ts",
  },
  bundle: true,
  platform: "browser",
  format: "iife",
  write: false,
  define: {
    "process.env.NEXT_PUBLIC_SUPABASE_URL": JSON.stringify(
      "https://sdk-acceptance.invalid",
    ),
    "process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY": JSON.stringify(
      "fixture-only-not-a-key",
    ),
    "process.env.NODE_ENV": JSON.stringify("test"),
  },
}).outputFiles[0].text;

const USER = "11111111-1111-4111-8111-111111111111";
function session(revision = 0) {
  const now = Math.floor(Date.now() / 1000);
  const part = (data: object) =>
    Buffer.from(JSON.stringify(data)).toString("base64url");
  const user = {
    id: USER,
    aud: "authenticated",
    role: "authenticated",
    email: "fixture@example.com",
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: {},
    identities: [],
    created_at: "2026-01-01T00:00:00Z",
  };
  return {
    access_token: `${part({ alg: "HS256", typ: "JWT" })}.${part({ sub: USER, aud: "authenticated", role: "authenticated", email: user.email, iat: now, exp: now + 3600, fixture_revision: revision })}.fixture-signature`,
    refresh_token: `fixture-refresh-${revision}`,
    token_type: "bearer",
    expires_in: 3600,
    expires_at: now + 3600,
    user,
  };
}

declare global {
  interface Window {
    sdkHarness: {
      ready: Promise<unknown>;
      uid: () => Promise<string | null>;
      events: string[];
      login: (email: string) => Promise<unknown>;
      logout: () => Promise<unknown>;
      refresh: () => Promise<unknown>;
      changePassword: () => Promise<unknown>;
      operation?: Promise<unknown>;
    };
  }
}

async function tab(context: BrowserContext) {
  const page = await context.newPage();
  await page.goto("/__test/browser-auth-sdk");
  await page.addScriptTag({ content: bundle });
  await page.evaluate(() => window.sdkHarness.ready.then(() => undefined));
  return page;
}

async function fixture(
  context: BrowserContext,
  holdLogin?: Promise<void>,
  failLogout = false,
) {
  const calls: string[] = [];
  let refresh = 0;
  await context.route("**/__test/browser-auth-sdk", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><title>SDK fixture acceptance</title>",
    }),
  );
  await context.route(
    "https://sdk-acceptance.invalid/auth/v1/**",
    async (route) => {
      const request = route.request();
      const headers = {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "POST, GET, OPTIONS",
        "access-control-allow-headers":
          "authorization, apikey, content-type, x-client-info, x-supabase-api-version",
      };
      if (request.method() === "OPTIONS")
        return route.fulfill({ status: 204, headers });
      const url = new URL(request.url());
      if (url.pathname.endsWith("/token")) {
        const password = url.searchParams.get("grant_type") === "password";
        calls.push(password ? "login" : "refresh");
        const body = request.postDataJSON();
        if (password && body.email === "wrong@example.com")
          return route.fulfill({
            status: 400,
            headers,
            json: {
              code: "invalid_credentials",
              error: "invalid_grant",
              error_description: "Invalid login credentials",
            },
          });
        if (password && holdLogin) await holdLogin;
        return route.fulfill({
          headers,
          json: session(password ? 0 : ++refresh),
        });
      }
      if (url.pathname.endsWith("/logout")) {
        calls.push("logout");
        if (failLogout)
          return route.fulfill({
            status: 400,
            headers,
            json: {
              code: "unexpected_failure",
              msg: "Controlled logout failure",
            },
          });
        return route.fulfill({ status: 204, headers });
      }
      if (url.pathname.endsWith("/user")) {
        if (request.method() === "PUT") calls.push("update");
        return route.fulfill({
          headers,
          json: { ...session().user, updated_at: "2026-10-25T00:00:00Z" },
        });
      }
      throw new Error(
        `Unexpected fixture auth endpoint: ${request.method()} ${url.pathname}`,
      );
    },
  );
  return calls;
}

test("actual SDK writes SSR cookies and a fresh tab restores the fixture session", async ({
  context,
}) => {
  await fixture(context);
  const a = await tab(context);
  expect(await a.evaluate(() => window.sdkHarness.uid())).toBeNull();
  expect(
    await a.evaluate(() => window.sdkHarness.login("fixture@example.com")),
  ).toEqual({ accepted: true, error: null });
  expect(
    (await context.cookies()).some((cookie) =>
      cookie.name.includes("auth-token"),
    ),
  ).toBe(true);
  const b = await tab(context);
  expect(await b.evaluate(() => window.sdkHarness.uid())).toBe(USER);
});

test("actual SDK broadcasts sign-in/sign-out and clears cookies across open tabs", async ({
  context,
}) => {
  const calls = await fixture(context);
  const a = await tab(context),
    b = await tab(context);
  await a.evaluate(() => window.sdkHarness.login("fixture@example.com"));
  await expect
    .poll(() => b.evaluate(() => window.sdkHarness.events))
    .toContain("SIGNED_IN");
  expect(await b.evaluate(() => window.sdkHarness.uid())).toBe(USER);
  await b.evaluate(() => window.sdkHarness.logout());
  await expect
    .poll(() => a.evaluate(() => window.sdkHarness.events))
    .toContain("SIGNED_OUT");
  expect(await a.evaluate(() => window.sdkHarness.uid())).toBeNull();
  expect(
    (await context.cookies()).filter((cookie) =>
      cookie.name.includes("auth-token"),
    ),
  ).toEqual([]);
  expect(calls).toEqual(["login", "logout"]);
});

test("actual SDK token refresh updates cookies and emits cross-tab refresh event", async ({
  context,
}) => {
  const calls = await fixture(context);
  const a = await tab(context),
    b = await tab(context);
  await a.evaluate(() => window.sdkHarness.login("fixture@example.com"));
  await expect
    .poll(() => b.evaluate(() => window.sdkHarness.events))
    .toContain("SIGNED_IN");
  const before = (await context.cookies()).filter((c) =>
    c.name.includes("auth-token"),
  );
  expect(await a.evaluate(() => window.sdkHarness.refresh())).toEqual({
    error: null,
  });
  await expect
    .poll(() => b.evaluate(() => window.sdkHarness.events))
    .toContain("TOKEN_REFRESHED");
  expect(
    (await context.cookies()).filter((c) => c.name.includes("auth-token")),
  ).not.toEqual(before);
  expect(await b.evaluate(() => window.sdkHarness.uid())).toBe(USER);
  expect(calls).toEqual(["login", "refresh"]);
});

test("queued cross-tab logout follows a pending real SDK login and removes its session", async ({
  context,
}) => {
  let release!: () => void;
  const calls = await fixture(
    context,
    new Promise<void>((resolve) => {
      release = resolve;
    }),
  );
  const a = await tab(context),
    b = await tab(context);
  await a.evaluate(() => {
    window.sdkHarness.operation = window.sdkHarness.login(
      "fixture@example.com",
    );
  });
  await expect.poll(() => [...calls]).toEqual(["login"]);
  await b.evaluate(() => {
    window.sdkHarness.operation = window.sdkHarness.logout();
  });
  await expect
    .poll(() =>
      b.evaluate(async () =>
        (await navigator.locks.query()).pending?.some(
          (lock) => lock.name === "bhromor:browser-auth",
        ),
      ),
    )
    .toBe(true);
  expect(calls).toEqual(["login"]);
  release();
  await a.evaluate(() => window.sdkHarness.operation);
  expect(await b.evaluate(() => window.sdkHarness.operation)).toEqual({
    accepted: true,
    error: null,
  });
  await expect.poll(() => a.evaluate(() => window.sdkHarness.uid())).toBeNull();
  expect(calls).toEqual(["login", "logout"]);
});

test("actual SDK credential refusal creates no session cookies", async ({
  context,
}) => {
  const calls = await fixture(context);
  const a = await tab(context);
  expect(
    await a.evaluate(() => window.sdkHarness.login("wrong@example.com")),
  ).toEqual({ accepted: true, error: "Invalid login credentials" });
  expect(await a.evaluate(() => window.sdkHarness.uid())).toBeNull();
  expect(
    (await context.cookies()).filter((cookie) =>
      cookie.name.includes("auth-token"),
    ),
  ).toEqual([]);
  expect(calls).toEqual(["login"]);
});

test("actual SDK password update uses the lane and broadcasts user update", async ({
  context,
}) => {
  const calls = await fixture(context);
  const a = await tab(context),
    b = await tab(context);
  await a.evaluate(() => window.sdkHarness.login("fixture@example.com"));
  await expect
    .poll(() => b.evaluate(() => window.sdkHarness.events))
    .toContain("SIGNED_IN");
  expect(await a.evaluate(() => window.sdkHarness.changePassword())).toEqual({
    accepted: true,
    error: null,
  });
  await expect
    .poll(() => b.evaluate(() => window.sdkHarness.events))
    .toContain("USER_UPDATED");
  expect(await b.evaluate(() => window.sdkHarness.uid())).toBe(USER);
  expect(calls).toEqual(["login", "update"]);
});

test("SDK clears local cookies even when remote logout fails", async ({
  context,
}) => {
  await fixture(context, undefined, true);
  const a = await tab(context);
  await a.evaluate(() => window.sdkHarness.login("fixture@example.com"));
  const result = await a.evaluate(() => window.sdkHarness.logout());
  expect(result).toEqual({
    accepted: true,
    error: "Controlled logout failure",
  });
  expect(await a.evaluate(() => window.sdkHarness.uid())).toBeNull();
  expect(
    (await context.cookies()).filter((cookie) =>
      cookie.name.includes("auth-token"),
    ),
  ).toEqual([]);
  expect(await a.evaluate(() => window.sdkHarness.events)).toContain(
    "SIGNED_OUT",
  );
});
