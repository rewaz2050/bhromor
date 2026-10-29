import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { resolve } from "node:path";

// Execute the repository's actual lane in two independent browser realms.
// The SDK operations are controlled; the browser LockManager is NOT mocked.
const compiled = ts.transpileModule(
  readFileSync(resolve(process.cwd(), "src/lib/rider-auth-lane.ts"), "utf8"),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  },
).outputText;
const bootstrap = `(() => { const exports = {}; ${compiled}; window.authHarness = { run: exports.runBrowserAuthMutation, client: {}, events: [], active: true }; })();`;

declare global {
  interface Window {
    authHarness: {
      run: (
        client: object,
        current: () => boolean,
        operation: () => Promise<unknown>,
        logout?: boolean,
      ) => Promise<unknown>;
      client: object;
      events: string[];
      active: boolean;
      release?: () => void;
      completion?: Promise<unknown>;
    };
  }
}

async function tab(context: BrowserContext) {
  const page = await context.newPage();
  // A same-origin intercepted document, not a production-only test route.
  await page.goto("/__test/browser-auth-lock");
  await page.addScriptTag({ content: bootstrap });
  expect(
    await page.evaluate(() => window.isSecureContext && !!navigator.locks),
  ).toBe(true);
  return page;
}
async function hold(page: Page) {
  await page.evaluate(() => {
    const h = window.authHarness;
    h.completion = h.run(
      h.client,
      () => h.active,
      async () => {
        h.events.push("start");
        await new Promise<void>((resolve) => {
          h.release = resolve;
        });
        h.events.push("finish");
      },
    );
  });
  await expect
    .poll(() => page.evaluate(() => window.authHarness.events))
    .toEqual(["start"]);
}
async function pending(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(
        async () =>
          (await navigator.locks.query()).pending?.filter(
            (lock) => lock.name === "bhromor:browser-auth",
          ).length,
      ),
    )
    .toBe(1);
}
async function queue(page: Page, logout = false) {
  await page.evaluate((flag) => {
    const h = window.authHarness;
    h.completion = h.run(
      h.client,
      () => h.active,
      async () => {
        h.events.push("sdk");
        return "done";
      },
      flag,
    );
  }, logout);
}

test.beforeEach(async ({ context }) => {
  await context.route("**/__test/browser-auth-lock", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><title>Auth lock acceptance</title>",
    }),
  );
});

test("native Web Lock prevents SDK overlap between two tabs", async ({
  context,
}) => {
  const a = await tab(context),
    b = await tab(context);
  await hold(a);
  await queue(b);
  await pending(b);
  expect(await b.evaluate(() => window.authHarness.events)).toEqual([]);
  await a.evaluate(() => {
    window.authHarness.release!();
  });
  expect(await b.evaluate(() => window.authHarness.completion)).toEqual({
    accepted: true,
    value: "done",
  });
  expect(await a.evaluate(() => window.authHarness.events)).toEqual([
    "start",
    "finish",
  ]);
});

test("queued abandoned login skips SDK dispatch after acquiring the native lock", async ({
  context,
}) => {
  const a = await tab(context),
    b = await tab(context);
  await hold(a);
  await queue(b);
  await pending(b);
  await b.evaluate(() => {
    window.authHarness.active = false;
  });
  await a.evaluate(() => {
    window.authHarness.release!();
  });
  expect(await b.evaluate(() => window.authHarness.completion)).toEqual({
    accepted: false,
  });
  expect(await b.evaluate(() => window.authHarness.events)).toEqual([]);
});

test("explicit logout still runs when its originating view is abandoned", async ({
  context,
}) => {
  const a = await tab(context),
    b = await tab(context);
  await hold(a);
  await queue(b, true);
  await pending(b);
  await b.evaluate(() => {
    window.authHarness.active = false;
  });
  await a.evaluate(() => {
    window.authHarness.release!();
  });
  expect(await b.evaluate(() => window.authHarness.completion)).toEqual({
    accepted: false,
  });
  expect(await b.evaluate(() => window.authHarness.events)).toEqual(["sdk"]);
});

test("closing the lock-holder tab releases the browser lock for the waiting tab", async ({
  context,
}) => {
  const a = await tab(context),
    b = await tab(context);
  await hold(a);
  await queue(b);
  await pending(b);
  await a.close();
  expect(await b.evaluate(() => window.authHarness.completion)).toEqual({
    accepted: true,
    value: "done",
  });
  // Browser release is not cancellation of HTTP already dispatched by that tab.
});

test("SDK rejection releases native lock and does not poison the local queue", async ({
  context,
}) => {
  const a = await tab(context);
  expect(
    await a.evaluate(async () => {
      const h = window.authHarness;
      try {
        await h.run(
          h.client,
          () => true,
          async () => {
            throw new Error("controlled rejection");
          },
        );
      } catch {
        return "rejected";
      }
    }),
  ).toBe("rejected");
  await queue(a);
  expect(await a.evaluate(() => window.authHarness.completion)).toEqual({
    accepted: true,
    value: "done",
  });
});
