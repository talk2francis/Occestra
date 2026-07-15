import { useId } from "react";

/** The ring path is r=44 about (60,60), so its circumference is fixed and known. */
const RING_RADIUS = 44;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

/**
 * Trailing separator, no trailing space: the string meets its own head at the seam,
 * and the "·" is what the reader sees there rather than two jammed letters.
 */
const RING_TEXT = "EIP-712 · SEALED ON X LAYER · OCCESTRA ·";

/**
 * The provenance seal. Ring text + the concentric-square check from the real
 * generated brand mark. One color, stamped — like ink, not like a badge icon.
 */
export function SealMark({
  size = 96,
  className = "text-amethyst",
  title = "Sealed on X Layer",
}: {
  size?: number;
  className?: string;
  title?: string;
}) {
  const id = useId();
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      role="img"
      aria-label={title}
      className={`glow-seal ${className}`}
    >
      <defs>
        <path id={`${id}-ring`} d="M 60,60 m -44,0 a 44,44 0 1,1 88,0 a 44,44 0 1,1 -88,0" />
      </defs>
      <circle cx="60" cy="60" r="57" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="60" cy="60" r="53.5" fill="none" stroke="currentColor" strokeWidth="0.6" opacity="0.55" />
      {/*
        The ring text is locked to the ring's own circumference.

        It used to carry a fixed letterSpacing, which made the string ~308px long on a
        path only 2π×44 ≈ 276px around. The tail ran past the start and overprinted it,
        so the stamp read "EIP-71SEALED ON X LAYER". textLength + lengthAdjust="spacing"
        distributes the glyphs to fit EXACTLY once around, whatever the font resolves to,
        so it can never collide with itself again.
      */}
      <text fontSize="9.2" fontWeight="600" fill="currentColor" style={{ fontFamily: "var(--font-sans)" }}>
        <textPath
          href={`#${id}-ring`}
          startOffset="0"
          textLength={RING_LENGTH}
          lengthAdjust="spacing"
        >
          {RING_TEXT}
        </textPath>
      </text>
      <g transform="translate(60 60)">
        <rect x="-19" y="-19" width="38" height="38" fill="none" stroke="currentColor" strokeWidth="2.6" />
        <rect x="-12" y="-12" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" />
        <path
          d="M -6.5 0.5 L -1.5 5.5 L 7.5 -5.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  );
}
