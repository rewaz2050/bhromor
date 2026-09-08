/**
 * Shared JSON envelopes for the storefront API routes.
 * Every response is `no-store` — demo/live status and order data must never
 * be served stale from an edge cache.
 */

import { NextResponse } from "next/server";

const NO_STORE = { "Cache-Control": "no-store" } as const;

export const apiJson = <T>(data: T, status = 200): NextResponse<T> =>
  NextResponse.json(data, { status, headers: { ...NO_STORE } });

export const apiError = (
  message: string,
  status: number,
  extra?: Record<string, unknown>,
): NextResponse =>
  NextResponse.json(
    { error: message, ...extra },
    { status, headers: { ...NO_STORE } },
  );
