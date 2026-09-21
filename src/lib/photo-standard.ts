/**
 * The shop's photo standard — the cheapest premium signal there is.
 *
 * Cards crop to 4:5 portrait and full-bleed on big phones, so photos that
 * are small or the wrong shape end up blurry or badly cropped no matter how
 * good the code looks. The storefront cannot fix a 480px photo; only the
 * shop can. This check is a kind nudge in the editor, never a block — a
 * real photo today beats a perfect photo never.
 */

export const PHOTO_MIN_WIDTH = 1200;
/** 4:5 portrait — what product cards actually show. */
export const PHOTO_IDEAL_RATIO = 4 / 5;
/** How far off 4:5 before the crop starts eating the garment. */
export const PHOTO_RATIO_TOLERANCE = 0.25;

export type PhotoCheckLevel = "ok" | "warn";

export interface PhotoCheckResult {
  level: PhotoCheckLevel;
  /** Human notes for the staff UI (English; admin tools are English). */
  notes: string[];
  /** Compact verdict, e.g. "1600×2000 — meets the photo standard". */
  summary: string;
}

const ratioNote = "not 4:5 portrait — cards will crop it; aim for 4:5 (e.g. 1200×1500)";
const smallNote = `below ${PHOTO_MIN_WIDTH}px wide — it will look soft on big phones`;

export const photoCheck = (width: number, height: number): PhotoCheckResult => {
  const notes: string[] = [];
  const w = Math.max(0, Math.floor(width));
  const h = Math.max(0, Math.floor(height));
  if (w === 0 || h === 0) {
    return {
      level: "warn",
      notes: [],
      summary: "could not read the image size",
    };
  }
  const ratio = w / h;
  if (w < PHOTO_MIN_WIDTH) notes.push(smallNote);
  if (Math.abs(ratio - PHOTO_IDEAL_RATIO) > PHOTO_RATIO_TOLERANCE) {
    notes.push(ratioNote);
  }
  return {
    level: notes.length === 0 ? "ok" : "warn",
    notes,
    summary: `${w}×${h} — ${
      notes.length === 0 ? "meets the photo standard" : "see the notes"
    }`,
  };
};
