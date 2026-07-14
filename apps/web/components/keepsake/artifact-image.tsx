"use client";

import { useState } from "react";

/**
 * An artifact image that cannot render as a broken icon.
 *
 * Signed URLs expire, storage can lose a file, a byte range can be truncated. When
 * any of that happens the honest thing to show is a plain statement that the image
 * is unavailable — not the browser's torn-page glyph, which reads as "this site is
 * broken" rather than "this file is gone".
 */
export function ArtifactImage({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div className="mt-4 flex min-h-40 flex-col items-center justify-center rounded-xl border border-dashed border-ink/15 bg-panel/50 p-8 text-center">
        <p className="font-serif text-[1.05rem] text-ink/70">This image could not be loaded.</p>
        <p className="text-data mt-2 max-w-sm text-ink/55">
          It was graded and delivered, but its file is not reachable right now. Nothing has been
          substituted in its place.
        </p>
      </div>
    );
  }

  return (
    /* eslint-disable-next-line @next/next/no-img-element -- signed expiring URL, remote host */
    <img
      src={src}
      alt={alt}
      onError={() => setFailed(true)}
      className="mt-4 w-full rounded-xl border border-ink/10 shadow-lift"
    />
  );
}
