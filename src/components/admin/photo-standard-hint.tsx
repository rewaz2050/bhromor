"use client";

import { useEffect, useState } from "react";
import { photoCheck } from "@/lib/photo-standard";

/**
 * A quiet one-line photo check beside every image in the product editor —
 * reads the real dimensions in the browser and says whether the photo meets
 * the shop standard (≥1200px wide, 4:5 portrait). A nudge, never a block.
 */

interface Loaded {
  width: number;
  height: number;
  failed: boolean;
}

export default function PhotoStandardHint({ src }: { src: string }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  /* The measurement key: an effect that (re)loads the probe image whenever
     the src changes, without a synchronous setState in the effect body. */
  const [probe, setProbe] = useState(src);
  if (probe !== src) setProbe(src);

  useEffect(() => {
    let alive = true;
    const image = new Image();
    image.onload = () => {
      if (alive) {
        setLoaded({ width: image.naturalWidth, height: image.naturalHeight, failed: false });
      }
    };
    image.onerror = () => {
      if (alive) setLoaded({ width: 0, height: 0, failed: true });
    };
    image.src = probe;
    return () => {
      alive = false;
    };
  }, [probe]);

  if (!loaded || loaded.failed) return null;
  const check = photoCheck(loaded.width, loaded.height);

  return (
    <span
      data-testid="photo-standard-hint"
      data-level={check.level}
      className={`mt-0.5 block text-[0.7rem] leading-4 ${
        check.level === "ok" ? "text-emerald-700" : "text-amber-700"
      }`}
    >
      {check.summary}
      {check.notes.map((note) => (
        <span key={note} className="block">
          {note}
        </span>
      ))}
    </span>
  );
}
