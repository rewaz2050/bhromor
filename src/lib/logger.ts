/**
 * Structured error logger (audit P2-09).
 *
 * - Server: console.error with JSON payload for Vercel log drains.
 * - Client: console.error + queue for /api/events error channel (best-effort).
 * - Redacts PII (phone, email, cookie, token) before logging.
 */

const REDACT_KEYS = new Set(["phone", "email", "customer_phone", "token", "password", "cookie", "authorization", "x-health-token"]);

const redact = (obj: Record<string, unknown>): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (REDACT_KEYS.has(k.toLowerCase())) {
      out[k] = "[redacted]";
    } else if (typeof v === "string" && v.length > 500) {
      out[k] = `${v.slice(0, 500)}…[truncated]`;
    } else {
      out[k] = v;
    }
  }
  return out;
};

export interface LogContext {
  route?: string;
  action?: string;
  code?: string;
  [key: string]: unknown;
}

export const logError = (message: string, error: unknown, context: LogContext = {}): void => {
  const errMsg = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack?.slice(0, 1200) : undefined;

  const payload = {
    level: "error" as const,
    message,
    error: errMsg,
    ...(stack ? { stack } : {}),
    ...redact(context as Record<string, unknown>),
    ts: new Date().toISOString(),
  };

  // Structured for log drains
  console.error(`[PROSHANTI] ${message}`, JSON.stringify(payload));

  // Client-side: also queue to /api/events as purchase-adjacent error signal (non-blocking)
  if (typeof window !== "undefined" && typeof navigator !== "undefined" && navigator.sendBeacon) {
    try {
      const blob = new Blob(
        [JSON.stringify({ t: "error", message, code: context.code ?? "unknown", path: context.route ?? location.pathname })],
        { type: "application/json" },
      );
      // Best-effort, endpoint may not exist yet — dropped silently in that case
      navigator.sendBeacon("/api/events", blob);
    } catch {
      // swallowed
    }
  }
};

export const logWarn = (message: string, context: LogContext = {}): void => {
  console.warn(`[PROSHANTI] ${message}`, JSON.stringify({ ...redact(context as Record<string, unknown>), ts: new Date().toISOString() }));
};
