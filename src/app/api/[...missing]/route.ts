/**
 * Every `/api/*` path nothing else claims.
 *
 * Without this, the storefront's `[...missing]` catch-all (which sits at the
 * root, because route groups add no path segment) answered unknown API paths
 * with the 404 *HTML page* and a 200 — so a client doing
 * `fetch("/api/typo").then(r => r.json())` blew up on `Unexpected token '<'`
 * instead of hearing "no such endpoint" (scan 2026-10-08).
 *
 * Real routes always win over a catch-all, so nothing here shadows anything.
 */

import { apiError } from "@/lib/api-response";

export const dynamic = "force-dynamic";

const noSuchEndpoint = () => apiError("No such endpoint.", 404);

export const GET = noSuchEndpoint;
export const POST = noSuchEndpoint;
export const PUT = noSuchEndpoint;
export const PATCH = noSuchEndpoint;
export const DELETE = noSuchEndpoint;
export const HEAD = noSuchEndpoint;
