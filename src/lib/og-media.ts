/**
 * Turn any stored media src into something satori (next/og) can paint:
 * a `data:` URL. Local /images paths are read off disk, remote covers
 * (Cloudinary, Drive) are fetched once per render. Any failure answers
 * null — the card still renders as a clean text card, never an error.
 */

const mimeFor = (path: string): string => {
  const clean = path.split("?")[0].toLowerCase();
  if (clean.endsWith(".png")) return "image/png";
  if (clean.endsWith(".webp")) return "image/webp";
  if (clean.endsWith(".gif")) return "image/gif";
  return "image/jpeg";
};

export const ogImageSource = async (src: string): Promise<string | null> => {
  const v = src.trim();
  if (!v) return null;
  try {
    if (v.startsWith("/")) {
      const fs = await import("node:fs/promises");
      const path = await import("node:path");
      const buf = await fs.readFile(path.join(process.cwd(), "public", v));
      return `data:${mimeFor(v)};base64,${buf.toString("base64")}`;
    }
    if (!/^https?:\/\//i.test(v)) return null;
    const res = await fetch(v, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const type = (res.headers.get("content-type") ?? "").split(";")[0];
    if (!type.startsWith("image/")) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return `data:${type};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
};
