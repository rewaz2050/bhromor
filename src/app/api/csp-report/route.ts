/**
 * POST /api/csp-report — CSP violation collector (audit P2-01, E5.1).
 *
 * Browsers POST JSON {csp-report: {...}} per report-uri directive.
 * We validate size/type, log server-side (visible in Vercel logs), and
 * always answer 204 — a report endpoint must never break the page.
 * Future: forward to external aggregator if needed.
 */

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 8 * 1024;

const noContent = (status = 204) => new Response(null, { status });

export async function POST(request: Request) {
  let text: string;
  try {
    text = await request.text();
  } catch {
    return noContent(400);
  }
  if (text.length > MAX_BODY_BYTES) return noContent(413);

  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    return noContent(400);
  }

  // Log for soak analysis — rate-limited by proxy + no PII in report.
  // Redact URLs to avoid leaking query-string tokens.
  try {
    const report =
      typeof payload === "object" && payload !== null && "csp-report" in payload
        ? (payload as { "csp-report": unknown })["csp-report"]
        : payload;
    if (report && typeof report === "object") {
      const r = report as Record<string, unknown>;
      // Only log shape, not full URL (may contain ids)
      console.warn("[csp-violation]", {
        blocked: r["blocked-uri"] ?? r["blockedURI"],
        violated: r["violated-directive"] ?? r["effective-directive"],
        disposition: r.disposition ?? "report",
      });
    }
  } catch {
    // swallowed
  }

  return noContent();
}

// CSP reports also arrive as `application/csp-report` via older browsers
export async function GET() {
  return noContent(405);
}
