/** Media helpers for the admin editor (§13–15, §50–51). */

/** Loose validation for pasted image URLs / site paths. */
export const isValidImageSrc = (src: string): boolean =>
  /^\/(?!\/)/.test(src) || /^https?:\/\/[^\s]+$/i.test(src);

/** Pull a YouTube video id out of any common URL form, or return the id as-is. */
export const extractYoutubeId = (input: string): string | null => {
  const v = input.trim();
  if (!v) return null;
  const patterns = [
    /(?:youtube\.com\/watch\?(?:.*&)?v=)([\w-]{6,})/,
    /(?:youtu\.be\/)([\w-]{6,})/,
    /(?:youtube\.com\/embed\/)([\w-]{6,})/,
    /(?:youtube\.com\/shorts\/)([\w-]{6,})/,
    /^([\w-]{6,})$/,
  ];
  for (const re of patterns) {
    const m = v.match(re);
    if (m) return m[1];
  }
  return null;
};
