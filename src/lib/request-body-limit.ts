import { AdminInputError } from "@/lib/db/admin";

/**
 * Buffer a small API payload with a hard streaming cap before JSON parsing.
 * Content-Length is only an early reject hint; the stream itself is counted
 * because the header is user-controlled and may be absent or false.
 */
export async function requestWithBodyLimit(
  request: Request,
  maxBytes: number,
): Promise<Request> {
  if (!request.body || request.method === "GET" || request.method === "HEAD") return request;

  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    await request.body.cancel().catch(() => undefined);
    throw new AdminInputError("Request body is too large.", 413);
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new AdminInputError("Request body is too large.", 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const headers = new Headers(request.headers);
  headers.delete("content-length");
  headers.delete("transfer-encoding");
  return new Request(request.url, {
    method: request.method,
    headers,
    body: bytes,
    signal: request.signal,
  });
}
