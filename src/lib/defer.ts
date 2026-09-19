/**
 * Run work AFTER the first paint (audit 2026-09-17 P2.5).
 *
 * On a cold storefront load the browser used to fire /api/products,
 * /api/homepage, /api/zones, /api/account/me, /api/promo and /api/live in
 * the same tick as hydration — six connections competing with the hero
 * image and the product grid on a phone radio. Only the first two paint
 * anything; the rest (session badge, promo strip, live banner, zones) can
 * wait a moment without anyone noticing.
 *
 * `afterFirstPaint(fn)` runs `fn` in the browser's idle time once the current
 * frame has been painted, with a hard ceiling so it never waits for a busy
 * page to go quiet. On the server and in tests (no rAF/idle callbacks) it
 * runs immediately, so behaviour under vitest is unchanged.
 */
export const afterFirstPaint = (
  fn: () => void,
  opts: { timeout?: number } = {},
): (() => void) => {
  if (typeof window === "undefined" || typeof window.requestAnimationFrame !== "function") {
    fn();
    return () => {};
  }
  const timeout = opts.timeout ?? 1500;
  let rafId: number | null = null;
  let idleId: number | null = null;
  let timerId: ReturnType<typeof setTimeout> | null = null;
  let done = false;
  const run = () => {
    if (done) return;
    done = true;
    fn();
  };
  // rAF → the callback runs right before the NEXT frame, i.e. after the
  // current one (the first paint) has been committed.
  rafId = window.requestAnimationFrame(() => {
    rafId = null;
    if ("requestIdleCallback" in window) {
      idleId = window.requestIdleCallback(run, { timeout });
    } else {
      timerId = setTimeout(run, 50);
    }
  });
  return () => {
    done = true;
    if (rafId !== null) window.cancelAnimationFrame(rafId);
    if (idleId !== null && "cancelIdleCallback" in window) window.cancelIdleCallback(idleId);
    if (timerId !== null) clearTimeout(timerId);
  };
};
