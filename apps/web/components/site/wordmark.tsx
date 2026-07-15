import Image from "next/image";
import Link from "next/link";

/**
 * The brand lockup — the mark and the wordmark, side by side.
 *
 * One component so every header carries the identical logo. The source PNG is
 * un-matted (real alpha, no baked ground), so it sits on the cream, on the
 * panel, and over the hero without a seam. `priority` on the nav instance only:
 * it is above the fold on every route.
 */
export function Wordmark({
  height = 28,
  href = "/",
  priority = false,
  className = "",
}: {
  height?: number;
  href?: string | null;
  priority?: boolean;
  className?: string;
}) {
  // Both theme variants render; CSS on [data-theme] shows exactly one. The
  // light asset's real alpha goes muddy on dark grounds (and vice versa), so
  // each theme gets the lockup drawn for its own paper.
  const width = Math.round(height * (447 / 120));
  const img = (
    <>
      <Image
        src="/brand/logo-horizontal.png"
        alt="Occestra"
        width={width}
        height={height}
        priority={priority}
        className={`theme-daylight-only w-auto ${className}`}
        style={{ height }}
      />
      <Image
        src="/brand/logo-horizontal-dark.png"
        alt="Occestra"
        width={width}
        height={height}
        priority={priority}
        className={`theme-nocturne-only w-auto ${className}`}
        style={{ height }}
      />
    </>
  );

  if (!href) return img;
  return (
    <Link href={href} aria-label="Occestra — home" className="inline-flex items-center">
      {img}
    </Link>
  );
}
