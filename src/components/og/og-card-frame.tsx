/**
 * Shared 1200×630 share-card design, painted by next/og (satori). Satori
 * speaks a strict flexbox subset — every style here is inline and every
 * flex container declares display:flex. One editorial frame for the whole
 * site: brand rule top-left, headline mid-left, promise + host on the
 * footer line, product photography filling the right side.
 */

import type { ReactNode } from "react";
import { OG_TAGLINE } from "@/lib/og-card";

/* Brand tokens mirror src/app/globals.css (Tailwind can't help inside satori). */
const IVORY = "#fbf9f2";
const IVORY_DEEP = "#ede4d0";
const INK = "#14201a";
const INK_SOFT = "#5b645d";
const FOREST = "#0c1913";
const GOLD = "#ab8748";

export interface OgCardImage {
  src: string;
  alt: string;
}

interface OgCardFrameProps {
  brand?: string;
  title: string;
  titleSize?: number;
  description?: string;
  price?: string | null;
  compareAt?: string | null;
  tagline?: string;
  host: string;
  /** One cover photo (home/product) — data URL or absolute https URL. */
  image?: OgCardImage | null;
  /** …or an editorial grid of up to three (shop). */
  grid?: OgCardImage[];
}

/* satori paints raw <img> only — next/image is meaningless inside an OG bitmap. */
const Photo = ({ image, style }: { image: OgCardImage; style?: React.CSSProperties }) => (
  // eslint-disable-next-line @next/next/no-img-element
  <img
    src={image.src}
    alt={image.alt}
    width={Number(style?.width ?? 0)}
    height={Number(style?.height ?? 0)}
    style={{ objectFit: "cover", ...style }}
  />
);

/** Right-side photography: 1 / 2 / 3 covers get different crops. */
const OgPhotoPanel = ({
  image,
  grid,
  width,
  height,
}: {
  image?: OgCardImage | null;
  grid?: OgCardImage[];
  width: number;
  height: number;
}) => {
  const shots = grid?.length ? grid : image ? [image] : [];
  if (shots.length === 0) return null;
  const half = Math.floor(height / 2);

  if (shots.length === 1) {
    return <Photo image={shots[0]!} style={{ width, height }} />;
  }
  if (shots.length === 2) {
    return (
      <div style={{ display: "flex", flexDirection: "column", width, height }}>
        <Photo image={shots[0]!} style={{ width, height: half }} />
        <Photo image={shots[1]!} style={{ width, height: height - half }} />
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", width, height }}>
      <Photo image={shots[0]!} style={{ width, height: half }} />
      <div style={{ display: "flex", width, height: height - half }}>
        <Photo image={shots[1]!} style={{ width: Math.ceil(width / 2), height: height - half }} />
        <Photo
          image={shots[2]!}
          style={{ width: width - Math.ceil(width / 2), height: height - half }}
        />
      </div>
    </div>
  );
};

export default function OgCardFrame({
  brand = "PROSANTI",
  title,
  titleSize = 56,
  description,
  price,
  compareAt,
  tagline = OG_TAGLINE,
  host,
  image,
  grid,
}: OgCardFrameProps): ReactNode {
  const hasPhoto = Boolean(image || grid?.length);
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        background: `linear-gradient(135deg, ${IVORY} 0%, ${IVORY_DEEP} 100%)`,
      }}
    >
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "56px 48px 44px 64px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center" }}>
          <div style={{ display: "flex", color: FOREST, fontSize: 30, letterSpacing: 14, fontWeight: 700 }}>
            {brand}
          </div>
          <div style={{ display: "flex", width: 68, height: 4, background: GOLD, marginLeft: 24 }} />
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              color: INK,
              fontSize: titleSize,
              lineHeight: 1.12,
              fontWeight: 700,
              letterSpacing: -0.5,
            }}
          >
            {title}
          </div>
          {description ? (
            <div style={{ display: "flex", color: INK_SOFT, fontSize: 26, lineHeight: 1.35, marginTop: 18 }}>
              {description}
            </div>
          ) : null}
          {price ? (
            <div style={{ display: "flex", alignItems: "baseline", marginTop: 20 }}>
              <div style={{ display: "flex", color: FOREST, fontSize: 40, fontWeight: 700 }}>{price}</div>
              {compareAt ? (
                <div
                  style={{
                    display: "flex",
                    color: INK_SOFT,
                    fontSize: 28,
                    textDecoration: "line-through",
                    marginLeft: 16,
                  }}
                >
                  {compareAt}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", color: INK_SOFT, fontSize: 23 }}>{tagline}</div>
          <div style={{ display: "flex", color: FOREST, fontSize: 23, fontWeight: 700 }}>{host}</div>
        </div>
      </div>

      {hasPhoto ? (
        <div
          style={{
            display: "flex",
            width: 560,
            height: "100%",
            borderLeft: `1px solid ${IVORY_DEEP}`,
          }}
        >
          <OgPhotoPanel image={image} grid={grid} width={560} height={630} />
        </div>
      ) : null}
    </div>
  );
}
