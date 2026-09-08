/**
 * PROSANTI brand emblem — official artwork.
 *
 * Raster extracted from the brand-kit artwork
 * (file_00000000b59081fa895b43e61079fe57.png → public/brand/logo-emblem.png,
 * transparent background). Intrinsic ratio kept via width/height; callers
 * control display size through className (e.g. "h-10 w-auto").
 */
export default function LogoMark({
  className = "h-9 w-auto",
}: {
  className?: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/brand/logo-emblem.png"
      alt=""
      width={433}
      height={510}
      draggable={false}
      className={className}
    />
  );
}
