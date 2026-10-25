"use client";

import { useState } from "react";

/** Preview failure must not change the saved media URL or block editor controls. */
export function MediaPreviewImage({ src, className, label = "media preview" }: { src: string; className?: string; label?: string }) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  if (failedSrc === src) {
    return <button type="button" className={`${className ?? ""} inline-flex min-h-11 min-w-11 items-center justify-center bg-ivory-100 px-1 text-[10px] font-medium text-ink-soft ring-1 ring-line`} aria-label={`Preview unavailable. Retry ${label}`} onClick={() => setFailedSrc(null)}>Retry</button>;
  }
  // Staff-entered remote media is previewed directly, not sent through Next's optimizer.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" className={className} loading="lazy" onError={() => setFailedSrc(src)} />;
}
